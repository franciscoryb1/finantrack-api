import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { MovementType } from '@prisma/client';

@Injectable()
export class AccountTransfersService {
    constructor(private readonly prisma: PrismaService) { }

    async create(userId: number, dto: CreateTransferDto) {
        const { fromAccountId, toAccountId, amountCents, description, transferredAt } = dto;

        if (fromAccountId === toAccountId) {
            throw new BadRequestException('Source and destination accounts must be different');
        }

        return this.prisma.$transaction(async (tx) => {
            const [fromAccount, toAccount] = await Promise.all([
                tx.account.findFirst({ where: { id: fromAccountId, userId, isActive: true } }),
                tx.account.findFirst({ where: { id: toAccountId, userId, isActive: true } }),
            ]);

            if (!fromAccount) throw new BadRequestException('Source account not found or inactive');
            if (!toAccount) throw new BadRequestException('Destination account not found or inactive');

            const newFromBalance = fromAccount.currentBalanceCents - amountCents;
            if (newFromBalance < 0) throw new BadRequestException('Insufficient balance');

            const newToBalance = toAccount.currentBalanceCents + amountCents;
            const date = transferredAt ? new Date(transferredAt) : new Date();
            const descOut = description ?? `Transferencia a ${toAccount.name}`;
            const descIn = description ?? `Transferencia desde ${fromAccount.name}`;

            const fromMovement = await tx.movement.create({
                data: {
                    userId,
                    accountId: fromAccountId,
                    type: MovementType.TRANSFER_OUT,
                    amountCents,
                    occurredAt: date,
                    description: descOut,
                    balanceSnapshotCents: newFromBalance,
                },
            });

            const toMovement = await tx.movement.create({
                data: {
                    userId,
                    accountId: toAccountId,
                    type: MovementType.TRANSFER_IN,
                    amountCents,
                    occurredAt: date,
                    description: descIn,
                    balanceSnapshotCents: newToBalance,
                },
            });

            await tx.account.update({
                where: { id: fromAccountId },
                data: { currentBalanceCents: newFromBalance },
            });

            await tx.account.update({
                where: { id: toAccountId },
                data: { currentBalanceCents: newToBalance },
            });

            return tx.accountTransfer.create({
                data: {
                    userId,
                    fromAccountId,
                    toAccountId,
                    amountCents,
                    description: description ?? null,
                    transferredAt: date,
                    fromMovementId: fromMovement.id,
                    toMovementId: toMovement.id,
                },
                include: {
                    fromAccount: { select: { id: true, name: true } },
                    toAccount: { select: { id: true, name: true } },
                },
            });
        });
    }

    async update(userId: number, id: number, dto: UpdateTransferDto) {
        return this.prisma.$transaction(async (tx) => {
            const transfer = await tx.accountTransfer.findFirst({
                where: { id, userId },
                include: {
                    fromAccount: { select: { id: true, name: true, currentBalanceCents: true } },
                    toAccount: { select: { id: true, name: true, currentBalanceCents: true } },
                },
            });

            if (!transfer) throw new NotFoundException('Transfer not found');

            const nextAmount = dto.amountCents ?? transfer.amountCents;
            const nextDate = dto.transferredAt ? new Date(dto.transferredAt) : transfer.transferredAt;
            const nextDescription = dto.description !== undefined ? (dto.description || null) : transfer.description;

            // Recalculate balances: revert original then apply new
            const newFromBalance = transfer.fromAccount.currentBalanceCents + transfer.amountCents - nextAmount;
            const newToBalance = transfer.toAccount.currentBalanceCents - transfer.amountCents + nextAmount;

            if (newFromBalance < 0) throw new BadRequestException('Insufficient balance');

            const descOut = nextDescription ?? `Transferencia a ${transfer.toAccount.name}`;
            const descIn = nextDescription ?? `Transferencia desde ${transfer.fromAccount.name}`;
            const tagUpdate = dto.tagIds !== undefined
                ? { tags: { set: dto.tagIds.map(tagId => ({ id: tagId })) } }
                : {};

            await Promise.all([
                tx.movement.update({
                    where: { id: transfer.fromMovementId },
                    data: { amountCents: nextAmount, occurredAt: nextDate, description: descOut, balanceSnapshotCents: newFromBalance, ...tagUpdate },
                }),
                tx.movement.update({
                    where: { id: transfer.toMovementId },
                    data: { amountCents: nextAmount, occurredAt: nextDate, description: descIn, balanceSnapshotCents: newToBalance, ...tagUpdate },
                }),
                tx.account.update({ where: { id: transfer.fromAccountId }, data: { currentBalanceCents: newFromBalance } }),
                tx.account.update({ where: { id: transfer.toAccountId }, data: { currentBalanceCents: newToBalance } }),
            ]);

            return tx.accountTransfer.update({
                where: { id },
                data: { amountCents: nextAmount, description: nextDescription, transferredAt: nextDate },
                include: {
                    fromAccount: { select: { id: true, name: true } },
                    toAccount: { select: { id: true, name: true } },
                },
            });
        });
    }

    async delete(userId: number, id: number) {
        return this.prisma.$transaction(async (tx) => {
            const transfer = await tx.accountTransfer.findFirst({
                where: { id, userId },
                include: {
                    fromAccount: { select: { id: true, currentBalanceCents: true } },
                    toAccount: { select: { id: true, currentBalanceCents: true } },
                },
            });

            if (!transfer) throw new NotFoundException('Transfer not found');

            // Revert balances
            const revertedFromBalance = transfer.fromAccount.currentBalanceCents + transfer.amountCents;
            const revertedToBalance = transfer.toAccount.currentBalanceCents - transfer.amountCents;

            await Promise.all([
                tx.account.update({ where: { id: transfer.fromAccountId }, data: { currentBalanceCents: revertedFromBalance } }),
                tx.account.update({ where: { id: transfer.toAccountId }, data: { currentBalanceCents: revertedToBalance } }),
            ]);

            // Delete AccountTransfer first (it holds FKs to movements), then the movements
            await tx.accountTransfer.delete({ where: { id } });
            await Promise.all([
                tx.movement.delete({ where: { id: transfer.fromMovementId } }),
                tx.movement.delete({ where: { id: transfer.toMovementId } }),
            ]);
        });
    }

    async listByUser(userId: number) {
        return this.prisma.accountTransfer.findMany({
            where: { userId },
            orderBy: { transferredAt: 'desc' },
            include: {
                fromAccount: { select: { id: true, name: true } },
                toAccount: { select: { id: true, name: true } },
            },
        });
    }
}
