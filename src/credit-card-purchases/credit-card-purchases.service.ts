import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ImportLegacyPurchaseDto } from './dto/import-legacy-purchase.dto';
import { CategoryType, CreditCardInstallmentStatus, CreditCardStatementStatus } from '@prisma/client';
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
        } = dto;

        // valido categoria y tarjeta
        await this.validateCategory(userId, categoryId);
        const creditCard = await this.validateCard(userId, creditCardId);

        const occurredDate = new Date(occurredAt);

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


            // Buscar el statement OPEN que contenga el timestamp exacto de la compra.
            // Usamos el timestamp real (no date-only) para evitar problemas de zona horaria:
            // los statements se guardan como medianoche local (ej: 03:00 UTC para UTC-3),
            // y la compra puede ser posterior en el mismo día UTC.
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
                // no hay statement abierto que cubra esta fecha → empieza en el próximo
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
                },
            });

            // generar cuotas (incluyendo compras en 1 solo pago)
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
                    const lastStmt = await tx.creditCardStatement.findFirst({
                        where: { creditCardId },
                        orderBy: { sequenceNumber: 'desc' },
                        select: { sequenceNumber: true },
                    });

                    const nextSeq = lastStmt ? lastStmt.sequenceNumber + 1 : 1;

                    const isPast =
                        year < currentYear ||
                        (year === currentYear && month < currentMonth);

                    // periodStartDate = closingDate del mes anterior si existe, sino día 1
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

                    const closingDate = new Date(year, month, 0); // último día del mes
                    const dueDate = new Date(closingDate);
                    dueDate.setDate(dueDate.getDate() + 5);

                    stmt = await tx.creditCardStatement.create({
                        data: {
                            userId,
                            creditCardId,
                            sequenceNumber: nextSeq,
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

        return this.prisma.$transaction(async (tx) => {

            const mustRegenerate =
                dto.totalAmountCents !== undefined ||
                dto.installmentsCount !== undefined ||
                dto.occurredAt !== undefined;

            const updated = await tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: {
                    ...dto,
                    ...(dto.occurredAt && { occurredAt: new Date(dto.occurredAt) }),
                },
            });

            if (mustRegenerate) {

                await tx.creditCardInstallment.deleteMany({
                    where: { purchaseId },
                });

                const occurredDate = updated.occurredAt;

                // 🔹 recalcular firstStatementSequence (mismo criterio que create)
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

                // 🔹 regenerar cuotas
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

        if (
            await this.hasBilledInstallments(purchaseId) ||
            await this.hasClosedStatement(purchaseId)
        ) {
            throw new BadRequestException(
                'Cannot modify purchase linked to a closed statement',
            );
        }


        return this.prisma.$transaction(async (tx) => {
            await tx.creditCardInstallment.deleteMany({
                where: { purchaseId },
            });

            return tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: { isDeleted: true },
            });
        });
    }
}
