import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateCreditCardCreditDto } from './dto/create-credit.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ImportLegacyPurchaseDto } from './dto/import-legacy-purchase.dto';
import { ReassignCardDto } from './dto/reassign-card.dto';
import { RegisterReimbursementDto } from './dto/register-reimbursement.dto';
import { CategoryType, CreditCardInstallmentStatus, CreditCardStatementStatus, MovementType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

function toDateOnly(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function computeInstallmentMonths(
    firstYear: number,
    firstMonth: number,
    count: number,
): Array<{ year: number; month: number }> {
    const result: Array<{ year: number; month: number }> = [];
    for (let i = 0; i < count; i++) {
        const totalMonths = firstYear * 12 + (firstMonth - 1) + i;
        result.push({
            year: Math.floor(totalMonths / 12),
            month: (totalMonths % 12) + 1,
        });
    }
    return result;
}

@Injectable()
export class CreditCardPurchasesService {
    constructor(private readonly prisma: PrismaService) { }

    // ---------- helpers ----------

    private async validateCategory(userId: number, categoryId?: number | null) {
        if (!categoryId) return;

        const category = await this.prisma.category.findFirst({
            where: {
                id: categoryId,
                type: CategoryType.EXPENSE,
                isActive: true,
                OR: [{ userId }, { userId: null }],
            },
        });

        if (!category) {
            throw new BadRequestException('Invalid category');
        }
    }

    private async validateCard(userId: number, creditCardId: number) {
        const card = await this.prisma.creditCard.findFirst({
            where: { id: creditCardId, userId, isActive: true },
        });

        if (!card) {
            throw new ForbiddenException('Credit card not found or inactive');
        }

        return card;
    }

    private async hasBilledInstallments(purchaseId: number) {
        const count = await this.prisma.creditCardInstallment.count({
            where: {
                purchaseId,
                status: { in: ['BILLED', 'PAID'] },
            },
        });

        return count > 0;
    }

    private async hasClosedStatement(purchaseId: number) {
        const count = await this.prisma.creditCardInstallment.count({
            where: {
                purchaseId,
                statement: {
                    status: { in: ['CLOSED', 'PAID'] },
                },
            },
        });

        return count > 0;
    }

    /** Crea el movimiento INCOME de reintegro y lo vincula a la compra. */
    private async createReimbursementMovement(
        tx: Prisma.TransactionClient,
        userId: number,
        purchaseId: number,
        amountCents: number,
        accountId: number,
        at: Date,
        purchaseDescription: string | null,
    ) {
        const account = await tx.account.findFirst({
            where: { id: accountId, userId, isActive: true },
            select: { id: true, currentBalanceCents: true },
        });
        if (!account) throw new BadRequestException('Reimbursement account not found or inactive');

        const newBalance = account.currentBalanceCents + amountCents;

        const movement = await tx.movement.create({
            data: {
                userId,
                accountId,
                type: MovementType.INCOME,
                amountCents,
                occurredAt: at,
                description: purchaseDescription ? `Reintegro - ${purchaseDescription}` : 'Reintegro',
                balanceSnapshotCents: newBalance,
            },
        });

        await tx.account.update({
            where: { id: accountId },
            data: { currentBalanceCents: newBalance },
        });

        await tx.creditCardPurchase.update({
            where: { id: purchaseId },
            data: { reimbursementMovementId: movement.id },
        });

        return movement;
    }

    /** Soft-delete del movimiento de reintegro y reversión del saldo. */
    private async deleteReimbursementMovement(
        tx: Prisma.TransactionClient,
        movementId: number,
    ) {
        const movement = await tx.movement.findUnique({
            where: { id: movementId },
            select: { id: true, accountId: true, amountCents: true, isDeleted: true },
        });
        if (!movement || movement.isDeleted) return;

        await tx.account.update({
            where: { id: movement.accountId },
            data: { currentBalanceCents: { decrement: movement.amountCents } },
        });

        await tx.movement.update({
            where: { id: movementId },
            data: { isDeleted: true },
        });
    }

    // ---------- core ----------

    async listByCard(userId: number, creditCardId: number) {
        return this.prisma.creditCardPurchase.findMany({
            where: {
                userId,
                creditCardId,
                isDeleted: false,
            },
            orderBy: { occurredAt: 'desc' },
            include: {
                category: { select: { id: true, name: true } },
            },
        });
    }

    async create(userId: number, dto: CreatePurchaseDto) {
        const {
            creditCardId,
            categoryId,
            totalAmountCents,
            installmentsCount,
            occurredAt,
            description,
            reimbursementAmountCents,
            reimbursementAccountId,
            reimbursementAt,
            sharedAmountCents,
        } = dto;

        await this.validateCategory(userId, categoryId);
        const creditCard = await this.validateCard(userId, creditCardId);

        if (sharedAmountCents !== undefined && sharedAmountCents > totalAmountCents) {
            throw new BadRequestException('sharedAmountCents cannot exceed totalAmountCents');
        }

        const occurredDate = new Date(occurredAt);

        const hasReimbursement = !!(reimbursementAmountCents && reimbursementAccountId);

        return this.prisma.$transaction(async (tx) => {

            // validar limite de la tarjeta
            const committed = await tx.creditCardInstallment.aggregate({
                where: {
                    purchase: { userId, creditCardId },
                    status: { in: ['PENDING', 'BILLED'] },
                },
                _sum: { amountCents: true },
            });

            const committedCents = committed._sum.amountCents ?? 0;

            if (committedCents + totalAmountCents > creditCard.limitCents) {
                throw new BadRequestException('Credit card limit exceeded');
            }

            // Buscar statement OPEN que cubra la fecha de la compra
            const openStatement = await tx.creditCardStatement.findFirst({
                where: {
                    creditCardId,
                    status: 'OPEN',
                    periodStartDate: { lte: occurredDate },
                    closingDate: { gt: occurredDate },
                },
                orderBy: { periodStartDate: 'desc' },
            });

            let firstStatementSequence: number;

            if (openStatement) {
                firstStatementSequence = openStatement.sequenceNumber;
            } else {
                const lastStatement = await tx.creditCardStatement.findFirst({
                    where: { creditCardId },
                    orderBy: { sequenceNumber: 'desc' },
                });

                firstStatementSequence = lastStatement
                    ? lastStatement.sequenceNumber + 1
                    : 1;
            }

            // crear compra
            const purchase = await tx.creditCardPurchase.create({
                data: {
                    userId,
                    creditCardId,
                    categoryId,
                    totalAmountCents,
                    installmentsCount,
                    occurredAt: occurredDate,
                    description,
                    firstStatementSequence,
                    sharedAmountCents,
                    ...(hasReimbursement && {
                        reimbursementAmountCents,
                        reimbursementAccountId,
                        reimbursementAt: reimbursementAt ? new Date(reimbursementAt) : occurredDate,
                    }),
                },
            });

            // generar cuotas
            const baseAmount = Math.floor(totalAmountCents / installmentsCount);
            const remainder = totalAmountCents % installmentsCount;

            const installmentsData: Prisma.CreditCardInstallmentCreateManyInput[] = [];

            for (let i = 1; i <= installmentsCount; i++) {
                const amount = i === 1 ? baseAmount + remainder : baseAmount;

                installmentsData.push({
                    userId,
                    purchaseId: purchase.id,
                    installmentNumber: i,
                    billingCycleOffset: i - 1,
                    amountCents: amount,
                    status: CreditCardInstallmentStatus.PENDING,
                    year: null,
                    month: null,
                });
            }

            await tx.creditCardInstallment.createMany({
                data: installmentsData,
            });

            // crear movimiento de reintegro si aplica
            if (hasReimbursement) {
                const reimbAt = reimbursementAt ? new Date(reimbursementAt) : occurredDate;
                await this.createReimbursementMovement(
                    tx,
                    userId,
                    purchase.id,
                    reimbursementAmountCents!,
                    reimbursementAccountId!,
                    reimbAt,
                    description ?? null,
                );
            }

            return purchase;
        });
    }



    async importLegacy(userId: number, dto: ImportLegacyPurchaseDto) {
        const {
            creditCardId,
            categoryId,
            totalAmountCents,
            installmentsCount,
            paidInstallmentsCount,
            occurredAt,
            description,
            firstStatementYear,
            firstStatementMonth,
        } = dto;

        if (paidInstallmentsCount >= installmentsCount) {
            throw new BadRequestException(
                'paidInstallmentsCount must be less than installmentsCount',
            );
        }

        await this.validateCategory(userId, categoryId);
        const creditCard = await this.validateCard(userId, creditCardId);

        const baseAmount = Math.floor(totalAmountCents / installmentsCount);
        const remainder = totalAmountCents % installmentsCount;

        const installmentMonths = computeInstallmentMonths(
            firstStatementYear,
            firstStatementMonth,
            installmentsCount,
        );

        return this.prisma.$transaction(async (tx) => {
            // ── 1. Verificar límite de crédito (solo cuotas pendientes) ──
            let pendingAmountCents = 0;
            for (let i = paidInstallmentsCount + 1; i <= installmentsCount; i++) {
                pendingAmountCents += i === 1 ? baseAmount + remainder : baseAmount;
            }

            const committed = await tx.creditCardInstallment.aggregate({
                where: {
                    purchase: { userId, creditCardId },
                    status: { in: ['PENDING', 'BILLED'] },
                },
                _sum: { amountCents: true },
            });

            if ((committed._sum.amountCents ?? 0) + pendingAmountCents > creditCard.limitCents) {
                throw new BadRequestException('Credit card limit exceeded');
            }

            // ── 2. Buscar o crear el statement de cada cuota ──
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            const statementByKey = new Map<string, { id: number; sequenceNumber: number; status: string; closingDate: Date }>();

            for (const { year, month } of installmentMonths) {
                const key = `${year}-${month}`;
                if (statementByKey.has(key)) continue;

                let stmt = await tx.creditCardStatement.findUnique({
                    where: { creditCardId_year_month: { creditCardId, year, month } },
                    select: { id: true, sequenceNumber: true, status: true, closingDate: true },
                });

                if (!stmt) {
                    // Calcular sequenceNumber correcto en orden cronológico
                    const statementsBefore = await tx.creditCardStatement.count({
                        where: {
                            creditCardId,
                            OR: [
                                { year: { lt: year } },
                                { year, month: { lt: month } },
                            ],
                        },
                    });
                    const newSeq = statementsBefore + 1;

                    // Shiftear statements existentes con seq >= newSeq para hacer lugar
                    await tx.creditCardStatement.updateMany({
                        where: { creditCardId, sequenceNumber: { gte: newSeq } },
                        data: { sequenceNumber: { increment: 1 } },
                    });

                    // Shiftear firstStatementSequence en compras afectadas
                    await tx.creditCardPurchase.updateMany({
                        where: { creditCardId, firstStatementSequence: { gte: newSeq } },
                        data: { firstStatementSequence: { increment: 1 } },
                    });

                    // Actualizar statementByKey en memoria para reflejar el shift
                    for (const [k, v] of statementByKey.entries()) {
                        if (v.sequenceNumber >= newSeq) {
                            statementByKey.set(k, { ...v, sequenceNumber: v.sequenceNumber + 1 });
                        }
                    }

                    const isPast =
                        year < currentYear ||
                        (year === currentYear && month < currentMonth);

                    const prevTotalMonths = year * 12 + (month - 1) - 1;
                    const prevYear = Math.floor(prevTotalMonths / 12);
                    const prevMonth = (prevTotalMonths % 12) + 1;
                    const prevStmt =
                        statementByKey.get(`${prevYear}-${prevMonth}`) ??
                        await tx.creditCardStatement.findUnique({
                            where: { creditCardId_year_month: { creditCardId, year: prevYear, month: prevMonth } },
                            select: { closingDate: true },
                        });

                    const periodStartDate = prevStmt
                        ? new Date(prevStmt.closingDate)
                        : new Date(year, month - 1, 1);

                    const closingDate = new Date(year, month, 0);
                    const dueDate = new Date(closingDate);
                    dueDate.setDate(dueDate.getDate() + 5);

                    stmt = await tx.creditCardStatement.create({
                        data: {
                            userId,
                            creditCardId,
                            sequenceNumber: newSeq,
                            year,
                            month,
                            periodStartDate,
                            closingDate,
                            dueDate,
                            status: isPast
                                ? CreditCardStatementStatus.PAID
                                : CreditCardStatementStatus.OPEN,
                            totalCents: 0,
                        },
                        select: { id: true, sequenceNumber: true, status: true, closingDate: true },
                    });
                }

                statementByKey.set(key, stmt);
            }

            // ── 3. firstStatementSequence ──
            const { year: fy, month: fm } = installmentMonths[0];
            const firstStatementSequence = statementByKey.get(`${fy}-${fm}`)!.sequenceNumber;

            // ── 4. Crear la compra ──
            const purchase = await tx.creditCardPurchase.create({
                data: {
                    userId,
                    creditCardId,
                    categoryId,
                    totalAmountCents,
                    installmentsCount,
                    occurredAt: new Date(occurredAt),
                    description,
                    firstStatementSequence,
                },
            });

            // ── 5. Crear cuotas ──
            const installmentsData: Prisma.CreditCardInstallmentCreateManyInput[] = [];
            const paidTotalByKey = new Map<string, number>();

            for (let i = 1; i <= installmentsCount; i++) {
                const amount = i === 1 ? baseAmount + remainder : baseAmount;
                const isPaid = i <= paidInstallmentsCount;
                const { year, month } = installmentMonths[i - 1];
                const key = `${year}-${month}`;
                const stmt = statementByKey.get(key)!;

                installmentsData.push({
                    userId,
                    purchaseId: purchase.id,
                    installmentNumber: i,
                    billingCycleOffset: i - 1,
                    amountCents: amount,
                    status: isPaid
                        ? CreditCardInstallmentStatus.PAID
                        : CreditCardInstallmentStatus.PENDING,
                    statementId: stmt.id,
                    year,
                    month,
                });

                if (isPaid) {
                    paidTotalByKey.set(key, (paidTotalByKey.get(key) ?? 0) + amount);
                }
            }

            await tx.creditCardInstallment.createMany({ data: installmentsData });

            // ── 6. Actualizar totalCents en los statements PAID auto-generados ──
            for (const [key, total] of paidTotalByKey) {
                const stmt = statementByKey.get(key)!;
                if (stmt.status === CreditCardStatementStatus.PAID) {
                    await tx.creditCardStatement.update({
                        where: { id: stmt.id },
                        data: { totalCents: total },
                    });
                }
            }

            return purchase;
        });
    }

    async createCredit(userId: number, dto: CreateCreditCardCreditDto) {
        const { creditCardId, amountCents, occurredAt, description, categoryId } = dto;

        await this.validateCategory(userId, categoryId);
        await this.validateCard(userId, creditCardId);

        const occurredDate = new Date(occurredAt);
        const year = occurredDate.getUTCFullYear();
        const month = occurredDate.getUTCMonth() + 1;

        return this.prisma.$transaction(async (tx) => {

            // Buscar o crear el statement para el mes/año de la devolución
            let stmt = await tx.creditCardStatement.findUnique({
                where: { creditCardId_year_month: { creditCardId, year, month } },
                select: { id: true, sequenceNumber: true, status: true },
            });

            if (!stmt) {
                const statementsBefore = await tx.creditCardStatement.count({
                    where: {
                        creditCardId,
                        OR: [
                            { year: { lt: year } },
                            { year, month: { lt: month } },
                        ],
                    },
                });
                const newSeq = statementsBefore + 1;

                await tx.creditCardStatement.updateMany({
                    where: { creditCardId, sequenceNumber: { gte: newSeq } },
                    data: { sequenceNumber: { increment: 1 } },
                });
                await tx.creditCardPurchase.updateMany({
                    where: { creditCardId, firstStatementSequence: { gte: newSeq } },
                    data: { firstStatementSequence: { increment: 1 } },
                });

                const now = new Date();
                const isPast =
                    year < now.getFullYear() ||
                    (year === now.getFullYear() && month < now.getMonth() + 1);

                const closingDate = new Date(year, month, 0);
                const dueDate = new Date(closingDate);
                dueDate.setDate(dueDate.getDate() + 5);

                stmt = await tx.creditCardStatement.create({
                    data: {
                        userId,
                        creditCardId,
                        sequenceNumber: newSeq,
                        year,
                        month,
                        periodStartDate: new Date(year, month - 1, 1),
                        closingDate,
                        dueDate,
                        status: isPast
                            ? CreditCardStatementStatus.PAID
                            : CreditCardStatementStatus.OPEN,
                        totalCents: 0,
                    },
                    select: { id: true, sequenceNumber: true, status: true },
                });
            }

            const purchase = await tx.creditCardPurchase.create({
                data: {
                    userId,
                    creditCardId,
                    categoryId,
                    totalAmountCents: -amountCents,
                    installmentsCount: 1,
                    occurredAt: occurredDate,
                    description,
                    firstStatementSequence: stmt.sequenceNumber,
                    isCredit: true,
                },
            });

            await tx.creditCardInstallment.create({
                data: {
                    userId,
                    purchaseId: purchase.id,
                    installmentNumber: 1,
                    billingCycleOffset: 0,
                    amountCents: -amountCents,
                    statementId: stmt.id,
                    year,
                    month,
                    status: stmt.status === CreditCardStatementStatus.OPEN
                        ? CreditCardInstallmentStatus.PENDING
                        : CreditCardInstallmentStatus.BILLED,
                },
            });

            return purchase;
        });
    }

    async update(userId: number, purchaseId: number, dto: UpdatePurchaseDto) {
        const purchase = await this.prisma.creditCardPurchase.findUnique({
            where: { id: purchaseId },
            include: { creditCard: true },
        });

        if (!purchase || purchase.isDeleted) {
            throw new NotFoundException('Purchase not found');
        }

        if (purchase.userId !== userId) {
            throw new ForbiddenException();
        }

        if (
            await this.hasBilledInstallments(purchaseId) ||
            await this.hasClosedStatement(purchaseId)
        ) {
            throw new BadRequestException(
                'Cannot modify purchase linked to a closed statement',
            );
        }

        if (dto.categoryId !== undefined) {
            await this.validateCategory(userId, dto.categoryId);
        }

        // Separar campos de reintegro y compartido del resto del DTO
        const {
            reimbursementAmountCents,
            reimbursementAccountId,
            reimbursementAt,
            sharedAmountCents,
            ...purchaseUpdateData
        } = dto;

        const isChangingReimbursement =
            reimbursementAmountCents !== undefined ||
            reimbursementAccountId !== undefined ||
            reimbursementAt !== undefined;

        if (sharedAmountCents !== undefined && sharedAmountCents !== null) {
            const effectiveTotal = purchaseUpdateData.totalAmountCents ?? purchase.totalAmountCents;
            if (sharedAmountCents > effectiveTotal) {
                throw new BadRequestException('sharedAmountCents cannot exceed totalAmountCents');
            }
        }

        return this.prisma.$transaction(async (tx) => {

            const mustRegenerate =
                purchaseUpdateData.totalAmountCents !== undefined ||
                purchaseUpdateData.installmentsCount !== undefined ||
                purchaseUpdateData.occurredAt !== undefined;

            const updated = await tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: {
                    ...purchaseUpdateData,
                    ...(purchaseUpdateData.occurredAt && { occurredAt: new Date(purchaseUpdateData.occurredAt) }),
                    ...(sharedAmountCents !== undefined ? { sharedAmountCents } : {}),
                },
            });

            if (mustRegenerate) {

                await tx.creditCardInstallment.deleteMany({
                    where: { purchaseId },
                });

                const occurredDate = updated.occurredAt;

                const openStatement = await tx.creditCardStatement.findFirst({
                    where: {
                        creditCardId: updated.creditCardId,
                        status: 'OPEN',
                        periodStartDate: { lte: occurredDate },
                        closingDate: { gt: occurredDate },
                    },
                    orderBy: { periodStartDate: 'desc' },
                });

                let firstStatementSequence: number;

                if (openStatement) {
                    firstStatementSequence = openStatement.sequenceNumber;
                } else {
                    const lastStatement = await tx.creditCardStatement.findFirst({
                        where: { creditCardId: updated.creditCardId },
                        orderBy: { sequenceNumber: 'desc' },
                    });

                    firstStatementSequence = lastStatement
                        ? lastStatement.sequenceNumber + 1
                        : 1;
                }

                await tx.creditCardPurchase.update({
                    where: { id: purchaseId },
                    data: { firstStatementSequence },
                });

                const { totalAmountCents, installmentsCount } = updated;

                if (installmentsCount > 1) {
                    const baseAmount = Math.floor(totalAmountCents / installmentsCount);
                    const remainder = totalAmountCents % installmentsCount;

                    const installmentsData: Prisma.CreditCardInstallmentCreateManyInput[] = [];

                    for (let i = 1; i <= installmentsCount; i++) {
                        const amount = i === 1 ? baseAmount + remainder : baseAmount;

                        installmentsData.push({
                            userId,
                            purchaseId,
                            installmentNumber: i,
                            billingCycleOffset: i - 1,
                            amountCents: amount,
                            status: 'PENDING',
                            year: null,
                            month: null,
                        });
                    }

                    await tx.creditCardInstallment.createMany({
                        data: installmentsData,
                    });
                }
            }

            // ── Manejar cambios en el reintegro ──
            if (isChangingReimbursement) {
                const clearing = reimbursementAmountCents === null;

                if (clearing) {
                    // Eliminar reintegro existente
                    if (purchase.reimbursementMovementId) {
                        await this.deleteReimbursementMovement(tx, purchase.reimbursementMovementId);
                    }
                    await tx.creditCardPurchase.update({
                        where: { id: purchaseId },
                        data: {
                            reimbursementAmountCents: null,
                            reimbursementAccountId: null,
                            reimbursementAt: null,
                            reimbursementMovementId: null,
                        },
                    });
                } else {
                    // Agregar o actualizar reintegro:
                    // Eliminar el movimiento anterior si existe
                    if (purchase.reimbursementMovementId) {
                        await this.deleteReimbursementMovement(tx, purchase.reimbursementMovementId);
                        await tx.creditCardPurchase.update({
                            where: { id: purchaseId },
                            data: { reimbursementMovementId: null },
                        });
                    }

                    const newAmountCents = reimbursementAmountCents ?? purchase.reimbursementAmountCents;
                    const newAccountId = reimbursementAccountId ?? purchase.reimbursementAccountId;
                    const newAt = reimbursementAt
                        ? new Date(reimbursementAt)
                        : (purchase.reimbursementAt ?? updated.occurredAt);

                    if (!newAmountCents || !newAccountId) {
                        throw new BadRequestException(
                            'Both reimbursementAmountCents and reimbursementAccountId are required',
                        );
                    }

                    await tx.creditCardPurchase.update({
                        where: { id: purchaseId },
                        data: {
                            reimbursementAmountCents: newAmountCents,
                            reimbursementAccountId: newAccountId,
                            reimbursementAt: newAt,
                        },
                    });

                    await this.createReimbursementMovement(
                        tx,
                        userId,
                        purchaseId,
                        newAmountCents,
                        newAccountId,
                        newAt,
                        updated.description,
                    );
                }
            }

            return updated;
        });
    }

    async reassignCard(userId: number, purchaseId: number, dto: ReassignCardDto) {
        const purchase = await this.prisma.creditCardPurchase.findUnique({
            where: { id: purchaseId },
        });

        if (!purchase || purchase.isDeleted) {
            throw new NotFoundException('Purchase not found');
        }

        if (purchase.userId !== userId) {
            throw new ForbiddenException();
        }

        const newCard = await this.validateCard(userId, dto.creditCardId);

        return this.prisma.$transaction(async (tx) => {
            // 1. Borrar todas las cuotas sin importar el estado del resumen
            await tx.creditCardInstallment.deleteMany({ where: { purchaseId } });

            const occurredDate = dto.occurredAt ? new Date(dto.occurredAt) : purchase.occurredAt;

            // 2. Calcular firstStatementSequence en la nueva tarjeta
            const openStatement = await tx.creditCardStatement.findFirst({
                where: {
                    creditCardId: dto.creditCardId,
                    status: 'OPEN',
                    periodStartDate: { lte: occurredDate },
                    closingDate: { gt: occurredDate },
                },
                orderBy: { periodStartDate: 'desc' },
            });

            let firstStatementSequence: number;

            if (openStatement) {
                firstStatementSequence = openStatement.sequenceNumber;
            } else {
                const lastStatement = await tx.creditCardStatement.findFirst({
                    where: { creditCardId: dto.creditCardId },
                    orderBy: { sequenceNumber: 'desc' },
                });

                firstStatementSequence = lastStatement ? lastStatement.sequenceNumber + 1 : 1;
            }

            // 3. Verificar límite de crédito en la nueva tarjeta
            const committed = await tx.creditCardInstallment.aggregate({
                where: {
                    purchase: { userId, creditCardId: dto.creditCardId },
                    status: { in: ['PENDING', 'BILLED'] },
                },
                _sum: { amountCents: true },
            });

            if ((committed._sum.amountCents ?? 0) + purchase.totalAmountCents > newCard.limitCents) {
                throw new BadRequestException('Credit card limit exceeded');
            }

            // 4. Actualizar la compra
            const updated = await tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: {
                    creditCardId: dto.creditCardId,
                    firstStatementSequence,
                    ...(dto.occurredAt && { occurredAt: occurredDate }),
                },
            });

            // 5. Regenerar cuotas en la nueva tarjeta
            const { totalAmountCents, installmentsCount } = updated;
            const baseAmount = Math.floor(totalAmountCents / installmentsCount);
            const remainder = totalAmountCents % installmentsCount;

            const installmentsData: Prisma.CreditCardInstallmentCreateManyInput[] = [];

            for (let i = 1; i <= installmentsCount; i++) {
                const amount = i === 1 ? baseAmount + remainder : baseAmount;
                installmentsData.push({
                    userId,
                    purchaseId,
                    installmentNumber: i,
                    billingCycleOffset: i - 1,
                    amountCents: amount,
                    status: CreditCardInstallmentStatus.PENDING,
                    year: null,
                    month: null,
                });
            }

            await tx.creditCardInstallment.createMany({ data: installmentsData });

            return updated;
        });
    }

    async softDelete(userId: number, purchaseId: number) {
        const purchase = await this.prisma.creditCardPurchase.findUnique({
            where: { id: purchaseId },
        });

        if (!purchase || purchase.isDeleted) {
            throw new NotFoundException('Purchase not found');
        }

        if (purchase.userId !== userId) {
            throw new ForbiddenException();
        }

        return this.prisma.$transaction(async (tx) => {
            // Eliminar movimiento de reintegro si existe
            if (purchase.reimbursementMovementId) {
                await this.deleteReimbursementMovement(tx, purchase.reimbursementMovementId);
            }

            // Desreferenciar reintegros compartidos que apuntan a esta compra
            await tx.movement.updateMany({
                where: { sharedFromCreditCardPurchaseId: purchaseId },
                data: { sharedFromCreditCardPurchaseId: null },
            });

            await tx.creditCardInstallment.deleteMany({
                where: { purchaseId },
            });

            return tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: { isDeleted: true, reimbursementMovementId: null },
            });
        });
    }

    async registerSharedReimbursement(userId: number, purchaseId: number, dto: RegisterReimbursementDto) {
        return this.prisma.$transaction(async (tx) => {
            const purchase = await tx.creditCardPurchase.findFirst({
                where: { id: purchaseId, userId, isDeleted: false },
                select: {
                    id: true, totalAmountCents: true, sharedAmountCents: true, description: true,
                    sharedReimbursements: {
                        where: { isDeleted: false },
                        select: { amountCents: true },
                    },
                },
            });

            if (!purchase) throw new NotFoundException('Purchase not found');
            if (!purchase.sharedAmountCents) throw new BadRequestException('Purchase is not a shared expense');

            const alreadyReceived = purchase.sharedReimbursements.reduce((s, r) => s + r.amountCents, 0);
            const pending = purchase.sharedAmountCents - alreadyReceived;

            if (dto.amountCents > pending) {
                throw new BadRequestException(`Amount exceeds pending reimbursement (${pending} cents)`);
            }

            const account = await tx.account.findFirst({
                where: { id: dto.accountId, userId, isActive: true },
                select: { id: true, currentBalanceCents: true },
            });
            if (!account) throw new BadRequestException('Account not found or inactive');

            const newBalance = account.currentBalanceCents + dto.amountCents;

            const movement = await tx.movement.create({
                data: {
                    userId,
                    accountId: dto.accountId,
                    type: MovementType.INCOME,
                    amountCents: dto.amountCents,
                    occurredAt: new Date(dto.occurredAt),
                    description: dto.description ?? (purchase.description ? `Reintegro - ${purchase.description}` : 'Reintegro'),
                    balanceSnapshotCents: newBalance,
                    sharedFromCreditCardPurchaseId: purchaseId,
                },
            });

            await tx.account.update({
                where: { id: dto.accountId },
                data: { currentBalanceCents: newBalance },
            });

            const newReceived = alreadyReceived + dto.amountCents;
            return {
                movement,
                sharedExpense: {
                    sharedAmountCents: purchase.sharedAmountCents,
                    receivedAmountCents: newReceived,
                    pendingAmountCents: purchase.sharedAmountCents - newReceived,
                },
            };
        });
    }
}
