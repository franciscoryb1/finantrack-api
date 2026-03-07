import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
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
