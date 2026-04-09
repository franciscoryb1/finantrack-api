import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { GetMovementsSummaryDto } from './dto/get-movements-summary.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { RegisterReimbursementDto } from './dto/register-reimbursement.dto';
import { MovementType } from '@prisma/client';

@Injectable()
export class MovementsService {
    constructor(private readonly prisma: PrismaService) { }

    private applyDelta(balance: number, type: MovementType, amountCents: number) {
        if (type === MovementType.INCOME || type === MovementType.TRANSFER_IN) return balance + amountCents;
        if (type === MovementType.EXPENSE || type === MovementType.STATEMENT_PAYMENT || type === MovementType.TRANSFER_OUT) return balance - amountCents;
        return balance;
    }

    private ensureNonNegative(balance: number) {
        if (balance < 0) throw new BadRequestException('Insufficient account balance');
    }

    // Si la string ya incluye hora ('T'), se parsea tal cual.
    // Si es solo fecha (YYYY-MM-DD), se interpreta como inicio o fin de día en ART (UTC-3).
    private parseFilterDate(dateStr: string, endOfDay = false): Date {
        if (dateStr.includes('T')) return new Date(dateStr);
        const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
        return new Date(`${dateStr}${time}-03:00`);
    }

    private async validateCategory(userId: number, categoryId?: number | null) {
        if (!categoryId) return;

        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, OR: [{ userId }, { userId: null }] },
            select: { id: true },
        });

        if (!category) throw new BadRequestException('Invalid category');
    }

    async createMovement(userId: number, dto: CreateMovementDto) {
        const { accountId, categoryId, type, amountCents, occurredAt, description, tagIds, sharedAmountCents, sharedReimbursementAccountId } = dto;

        await this.validateCategory(userId, categoryId);

        if (sharedAmountCents !== undefined && sharedAmountCents > amountCents) {
            throw new BadRequestException('sharedAmountCents cannot exceed amountCents');
        }

        // Transacción: leer cuenta activa del user + crear movimiento + update saldo
        return this.prisma.$transaction(async (tx) => {
            const account = await tx.account.findFirst({
                where: { id: accountId, userId, isActive: true },
                select: { id: true, currentBalanceCents: true },
            });

            if (!account) throw new ForbiddenException('Account not found or inactive');

            const newBalance = this.applyDelta(account.currentBalanceCents, type, amountCents);
            this.ensureNonNegative(newBalance);

            const movement = await tx.movement.create({
                data: {
                    userId,
                    accountId,
                    categoryId,
                    type,
                    amountCents,
                    occurredAt: new Date(occurredAt),
                    description,
                    balanceSnapshotCents: newBalance,
                    sharedAmountCents,
                    ...(tagIds?.length ? { tags: { connect: tagIds.map(id => ({ id })) } } : {}),
                },
            });

            await tx.account.update({
                where: { id: accountId },
                data: { currentBalanceCents: newBalance },
            });

            // Si hay gasto compartido con cuenta destino, crear el ingreso automáticamente
            if (sharedAmountCents && sharedReimbursementAccountId) {
                const reimbAccount = await tx.account.findFirst({
                    where: { id: sharedReimbursementAccountId, userId, isActive: true },
                    select: { id: true, currentBalanceCents: true },
                });
                if (!reimbAccount) throw new BadRequestException('Reimbursement account not found or inactive');

                const reimbBalance = reimbAccount.currentBalanceCents + sharedAmountCents;
                await tx.movement.create({
                    data: {
                        userId,
                        accountId: sharedReimbursementAccountId,
                        type: MovementType.INCOME,
                        amountCents: sharedAmountCents,
                        occurredAt: new Date(occurredAt),
                        description: description ? `Reintegro - ${description}` : 'Reintegro',
                        balanceSnapshotCents: reimbBalance,
                        sharedFromMovementId: movement.id,
                    },
                });
                await tx.account.update({
                    where: { id: sharedReimbursementAccountId },
                    data: { currentBalanceCents: reimbBalance },
                });
            }

            return movement;
        });
    }

    async getMovementsSummary(userId: number, dto: GetMovementsSummaryDto) {
        const { fromDate, toDate, accountId } = dto;

        const where: any = {
            userId,
            isDeleted: false,
            type: { in: [MovementType.INCOME, MovementType.EXPENSE] }, // excludes STATEMENT_PAYMENT, TRANSFER_OUT, TRANSFER_IN
        };

        if (accountId) where.accountId = accountId;

        if (fromDate || toDate) {
            where.occurredAt = {};
            if (fromDate) where.occurredAt.gte = this.parseFilterDate(fromDate);
            if (toDate) where.occurredAt.lte = this.parseFilterDate(toDate, true);
        }

        const result = await this.prisma.movement.groupBy({
            by: ['type'],
            where,
            _sum: { amountCents: true },
            _count: true,
        });

        const income = result.find(r => r.type === MovementType.INCOME);
        const expense = result.find(r => r.type === MovementType.EXPENSE);

        const totalIncomeCents = income?._sum.amountCents ?? 0;
        const totalExpenseCents = expense?._sum.amountCents ?? 0;
        const movementsCount = (income?._count ?? 0) + (expense?._count ?? 0);

        return {
            totalIncomeCents,
            totalExpenseCents,
            netBalanceCents: totalIncomeCents - totalExpenseCents,
            movementsCount,
        };
    }

    async listMovements(userId: number, query: ListMovementsDto) {
        const {
            accountId,
            categoryId,
            type,
            fromDate,
            toDate,
            page = 1,
            pageSize = 20,
        } = query;

        const skip = (page - 1) * pageSize;
        const take = pageSize;

        const where: any = {
            userId,
            isDeleted: false,
        };

        if (accountId) where.accountId = accountId;
        if (categoryId) where.categoryId = categoryId;
        if (type) where.type = type;

        if (fromDate || toDate) {
            where.occurredAt = {};
            if (fromDate) where.occurredAt.gte = this.parseFilterDate(fromDate);
            if (toDate) where.occurredAt.lte = this.parseFilterDate(toDate, true);
        }

        const [items, total] = await this.prisma.$transaction([
            this.prisma.movement.findMany({
                where,
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                skip,
                take,
                include: {
                    account: { select: { id: true, name: true, type: true } },
                    category: { select: { id: true, name: true, type: true, color: true, parent: { select: { id: true, name: true, color: true } } } },
                    recurringPayment: { select: { id: true } },
                    tags: { select: { id: true, name: true, color: true } },
                    sharedReimbursements: {
                        where: { isDeleted: false },
                        select: { amountCents: true },
                    },
                    reimbursedPurchase: { select: { id: true } },
                },
            }),
            this.prisma.movement.count({ where }),
        ]);

        return {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
            items,
        };
    }

    async getMovementById(userId: number, id: number) {
        const movement = await this.prisma.movement.findFirst({
            where: { id, userId },
            include: {
                account: { select: { id: true, name: true, type: true } },
                category: { select: { id: true, name: true, type: true, color: true, parent: { select: { id: true, name: true, color: true } } } },
                tags: { select: { id: true, name: true, color: true } },
            },
        });

        if (!movement) throw new NotFoundException('Movement not found');
        return movement;
    }

    async softDeleteMovement(userId: number, id: number) {
        return this.prisma.$transaction(async (tx) => {
            const movement = await tx.movement.findFirst({
                where: { id, userId, isDeleted: false },
                select: { id: true, accountId: true, type: true, amountCents: true },
            });

            if (!movement) throw new NotFoundException('Movement not found');

            if (movement.type === MovementType.BALANCE_ADJUSTMENT) {
                // Solo eliminar el registro; el saldo ya fue aplicado y no se revierte
                await tx.movement.update({
                    where: { id: movement.id },
                    data: { isDeleted: true },
                });
                return { success: true };
            }

            const account = await tx.account.findFirst({
                where: { id: movement.accountId, userId },
                select: { id: true, currentBalanceCents: true },
            });

            if (!account) throw new ForbiddenException('Account not found');

            // Revertir efecto
            const adds = movement.type === MovementType.INCOME || movement.type === MovementType.TRANSFER_IN;
            const revertedBalance = adds
                ? account.currentBalanceCents - movement.amountCents
                : account.currentBalanceCents + movement.amountCents; // EXPENSE, STATEMENT_PAYMENT, TRANSFER_OUT

            this.ensureNonNegative(revertedBalance);

            // Si el movimiento pagó un gasto recurrente, eliminar ese pago
            await tx.recurringExpensePayment.deleteMany({
                where: { movementId: movement.id },
            });

            // Eliminar reintegros de gasto compartido y revertir su efecto en el saldo
            const sharedReimbursements = await tx.movement.findMany({
                where: { sharedFromMovementId: movement.id, isDeleted: false },
                select: { id: true, accountId: true, amountCents: true },
            });

            for (const reimbursement of sharedReimbursements) {
                const reimbAccount = await tx.account.findFirst({
                    where: { id: reimbursement.accountId },
                    select: { id: true, currentBalanceCents: true },
                });
                if (reimbAccount) {
                    await tx.account.update({
                        where: { id: reimbAccount.id },
                        data: { currentBalanceCents: reimbAccount.currentBalanceCents - reimbursement.amountCents },
                    });
                }
                await tx.movement.update({
                    where: { id: reimbursement.id },
                    data: { isDeleted: true },
                });
            }

            await tx.movement.update({
                where: { id: movement.id },
                data: { isDeleted: true },
            });

            await tx.account.update({
                where: { id: account.id },
                data: { currentBalanceCents: revertedBalance },
            });

            return { success: true };
        });
    }

    async updateMovement(userId: number, id: number, dto: UpdateMovementDto) {
        // Idea: revertir movimiento original y aplicar el nuevo (posible cambio de cuenta)
        return this.prisma.$transaction(async (tx) => {
            const original = await tx.movement.findFirst({
                where: { id, userId, isDeleted: false },
                select: {
                    id: true,
                    accountId: true,
                    categoryId: true,
                    type: true,
                    amountCents: true,
                    occurredAt: true,
                    description: true,
                    sharedAmountCents: true,
                    sharedReimbursements: {
                        where: { isDeleted: false },
                        select: { id: true, accountId: true, amountCents: true },
                    },
                },
            });

            if (!original) throw new NotFoundException('Movement not found');

            if (original.type === MovementType.BALANCE_ADJUSTMENT) {
                // Solo permite actualizar categoría y descripción
                if (dto.categoryId !== undefined) {
                    await this.validateCategory(userId, dto.categoryId);
                }
                return tx.movement.update({
                    where: { id },
                    data: {
                        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
                        ...(dto.description !== undefined && { description: dto.description }),
                    },
                });
            }

            const nextAccountId = dto.accountId ?? original.accountId;
            const nextType = dto.type ?? original.type;
            const nextAmount = dto.amountCents ?? original.amountCents;
            const nextOccurredAt = dto.occurredAt ? new Date(dto.occurredAt) : original.occurredAt;
            const nextDescription = dto.description === undefined ? original.description : dto.description;
            const nextCategoryId =
                dto.categoryId === undefined ? original.categoryId : dto.categoryId;

            // Validate sharedAmountCents if being changed
            if (dto.sharedAmountCents !== undefined) {
                if (dto.sharedAmountCents !== null) {
                    const effectiveAmount = dto.amountCents ?? original.amountCents;
                    if (dto.sharedAmountCents > effectiveAmount) {
                        throw new BadRequestException('sharedAmountCents cannot exceed amountCents');
                    }
                }
            }

            await this.validateCategory(userId, nextCategoryId ?? undefined);

            // Cuentas involucradas (si cambia cuenta, son 2)
            const accountIds = Array.from(new Set([original.accountId, nextAccountId]));

            const accounts = await tx.account.findMany({
                where: { id: { in: accountIds }, userId },
                select: { id: true, currentBalanceCents: true, isActive: true },
            });

            const originalAccount = accounts.find(a => a.id === original.accountId);
            const nextAccount = accounts.find(a => a.id === nextAccountId);

            if (!originalAccount || !nextAccount) throw new ForbiddenException('Account not found');
            if (!nextAccount.isActive) throw new ForbiddenException('Target account is inactive');

            // 1) Revertir original desde su cuenta
            let originalAccountBalance =
                original.type === MovementType.INCOME
                    ? originalAccount.currentBalanceCents - original.amountCents
                    : originalAccount.currentBalanceCents + original.amountCents;

            this.ensureNonNegative(originalAccountBalance);

            // 2) Aplicar nuevo sobre cuenta destino
            let nextAccountBalance = nextAccount.currentBalanceCents;

            // Si la cuenta destino es la misma, arrancamos desde el balance ya revertido
            if (nextAccountId === original.accountId) {
                nextAccountBalance = originalAccountBalance;
            }

            nextAccountBalance = this.applyDelta(nextAccountBalance, nextType, nextAmount);
            this.ensureNonNegative(nextAccountBalance);

            // 3) Persistir cambios
            // Update movement primero (guardamos snapshot según cuenta destino)
            await tx.movement.update({
                where: { id: original.id },
                data: {
                    accountId: nextAccountId,
                    categoryId: nextCategoryId,
                    type: nextType,
                    amountCents: nextAmount,
                    occurredAt: nextOccurredAt,
                    description: nextDescription,
                    balanceSnapshotCents: nextAccountBalance,
                    ...(dto.sharedAmountCents !== undefined ? { sharedAmountCents: dto.sharedAmountCents } : {}),
                    ...(dto.tagIds !== undefined ? { tags: { set: dto.tagIds.map(id => ({ id })) } } : {}),
                },
            });

            // Update saldo(s) de cuentas
            if (nextAccountId === original.accountId) {
                await tx.account.update({
                    where: { id: original.accountId },
                    data: { currentBalanceCents: nextAccountBalance },
                });
            } else {
                await tx.account.update({
                    where: { id: original.accountId },
                    data: { currentBalanceCents: originalAccountBalance },
                });

                await tx.account.update({
                    where: { id: nextAccountId },
                    data: { currentBalanceCents: nextAccountBalance },
                });
            }

            // Si se eliminó el gasto compartido, revertir y eliminar los reintegros derivados
            if (dto.sharedAmountCents === null && original.sharedReimbursements.length > 0) {
                for (const reimbursement of original.sharedReimbursements) {
                    const reimbAccount = await tx.account.findFirst({
                        where: { id: reimbursement.accountId },
                        select: { id: true, currentBalanceCents: true },
                    });
                    if (reimbAccount) {
                        await tx.account.update({
                            where: { id: reimbAccount.id },
                            data: { currentBalanceCents: reimbAccount.currentBalanceCents - reimbursement.amountCents },
                        });
                    }
                    await tx.movement.update({
                        where: { id: reimbursement.id },
                        data: { isDeleted: true },
                    });
                }
            }

            return { success: true };
        });
    }

    async registerSharedReimbursement(userId: number, movementId: number, dto: RegisterReimbursementDto) {
        return this.prisma.$transaction(async (tx) => {
            // 1. Find the original movement
            const original = await tx.movement.findFirst({
                where: { id: movementId, userId, isDeleted: false },
                select: {
                    id: true, type: true, amountCents: true, sharedAmountCents: true, description: true,
                    sharedReimbursements: {
                        where: { isDeleted: false },
                        select: { amountCents: true },
                    },
                },
            });

            if (!original) throw new NotFoundException('Movement not found');
            if (!original.sharedAmountCents) throw new BadRequestException('Movement is not a shared expense');
            if (original.type !== MovementType.EXPENSE) throw new BadRequestException('Only EXPENSE movements can have reimbursements');

            const alreadyReceived = original.sharedReimbursements.reduce((s, r) => s + r.amountCents, 0);
            const pending = original.sharedAmountCents - alreadyReceived;

            if (dto.amountCents > pending) {
                throw new BadRequestException(`Amount exceeds pending reimbursement (${pending} cents)`);
            }

            // 2. Find the destination account
            const account = await tx.account.findFirst({
                where: { id: dto.accountId, userId, isActive: true },
                select: { id: true, currentBalanceCents: true },
            });
            if (!account) throw new BadRequestException('Account not found or inactive');

            const newBalance = account.currentBalanceCents + dto.amountCents;

            // 3. Create the INCOME movement
            const movement = await tx.movement.create({
                data: {
                    userId,
                    accountId: dto.accountId,
                    type: MovementType.INCOME,
                    amountCents: dto.amountCents,
                    occurredAt: new Date(dto.occurredAt),
                    description: dto.description ?? (original.description ? `Reintegro - ${original.description}` : 'Reintegro'),
                    balanceSnapshotCents: newBalance,
                    sharedFromMovementId: movementId,
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
                    sharedAmountCents: original.sharedAmountCents,
                    receivedAmountCents: newReceived,
                    pendingAmountCents: original.sharedAmountCents - newReceived,
                },
            };
        });
    }
}
