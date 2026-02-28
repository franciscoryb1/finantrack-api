import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { GetMovementsSummaryDto } from './dto/get-movements-summary.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { MovementType } from '@prisma/client';

@Injectable()
export class MovementsService {
    constructor(private readonly prisma: PrismaService) { }

    private applyDelta(balance: number, type: MovementType, amountCents: number) {
        if (type === MovementType.INCOME) return balance + amountCents;
        if (type === MovementType.EXPENSE) return balance - amountCents;
        return balance;
    }

    private ensureNonNegative(balance: number) {
        if (balance < 0) throw new BadRequestException('Insufficient account balance');
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
        const { accountId, categoryId, type, amountCents, occurredAt, description } = dto;

        await this.validateCategory(userId, categoryId);

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
                },
            });

            await tx.account.update({
                where: { id: accountId },
                data: { currentBalanceCents: newBalance },
            });

            return movement;
        });
    }

    async getMovementsSummary(userId: number, dto: GetMovementsSummaryDto) {
        const { fromDate, toDate, accountId } = dto;

        const where: any = { userId, isDeleted: false };

        if (accountId) where.accountId = accountId;

        if (fromDate || toDate) {
            where.occurredAt = {};
            if (fromDate) where.occurredAt.gte = new Date(fromDate);
            if (toDate) where.occurredAt.lte = new Date(toDate);
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
            if (fromDate) where.occurredAt.gte = new Date(fromDate);
            if (toDate) where.occurredAt.lte = new Date(toDate);
        }

        const [items, total] = await this.prisma.$transaction([
            this.prisma.movement.findMany({
                where,
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                skip,
                take,
                include: {
                    account: { select: { id: true, name: true, type: true } },
                    category: { select: { id: true, name: true, type: true } },
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
                category: { select: { id: true, name: true, type: true } },
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

            const account = await tx.account.findFirst({
                where: { id: movement.accountId, userId },
                select: { id: true, currentBalanceCents: true },
            });

            if (!account) throw new ForbiddenException('Account not found');

            // Revertir efecto
            const revertedBalance =
                movement.type === MovementType.INCOME
                    ? account.currentBalanceCents - movement.amountCents
                    : account.currentBalanceCents + movement.amountCents;

            this.ensureNonNegative(revertedBalance);

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
                },
            });

            if (!original) throw new NotFoundException('Movement not found');

            const nextAccountId = dto.accountId ?? original.accountId;
            const nextType = dto.type ?? original.type;
            const nextAmount = dto.amountCents ?? original.amountCents;
            const nextOccurredAt = dto.occurredAt ? new Date(dto.occurredAt) : original.occurredAt;
            const nextDescription = dto.description === undefined ? original.description : dto.description;
            const nextCategoryId =
                dto.categoryId === undefined ? original.categoryId : dto.categoryId;

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

            return { success: true };
        });
    }
}
