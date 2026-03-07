import {
    Injectable,
    ForbiddenException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
    constructor(private readonly prisma: PrismaService) { }

    // CREATE
    async createAccount(userId: number, dto: CreateAccountDto) {
        const { name, type, currentBalanceCents } = dto;

        if (currentBalanceCents !== undefined && currentBalanceCents < 0) {
            throw new BadRequestException('Initial balance cannot be negative');
        }

        return this.prisma.account.create({
            data: {
                name,
                type,
                userId,
                currentBalanceCents: currentBalanceCents ?? 0,
            },
        });
    }

    // LIST
    async listAccounts(userId: number, query: ListAccountsDto) {
        const { status, type } = query;

        let isActiveFilter: boolean | undefined;

        switch (status) {
            case 'inactive':
                isActiveFilter = false;
                break;
            case 'all':
                isActiveFilter = undefined;
                break;
            case 'active':
            default:
                isActiveFilter = true;
                break;
        }

        return this.prisma.account.findMany({
            where: {
                userId,
                ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
                ...(type && { type }),
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    // UPDATE
    async updateAccount(userId: number, accountId: number, dto: UpdateAccountDto) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });

        if (!account || account.userId !== userId) {
            throw new ForbiddenException('Account not found');
        }

        return this.prisma.account.update({
            where: { id: accountId },
            data: { name: dto.name },
        });
    }

    // ACTIVATE / DEACTIVATE
    async deactivateAccount(userId: number, accountId: number) {
        return this.changeAccountState(userId, accountId, false);
    }

    async activateAccount(userId: number, accountId: number) {
        return this.changeAccountState(userId, accountId, true);
    }


    // DELETE
    async deleteAccount(userId: number, accountId: number) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
            include: { _count: { select: { movements: true, creditCardsAsBank: true } } },
        });

        if (!account || account.userId !== userId) {
            throw new ForbiddenException('Account not found');
        }

        if (account._count.movements > 0) {
            throw new ConflictException(
                'No se puede eliminar una cuenta con movimientos registrados. Desactivala en su lugar.',
            );
        }

        if (account._count.creditCardsAsBank > 0) {
            throw new ConflictException(
                'No se puede eliminar una cuenta asociada a tarjetas de crédito.',
            );
        }

        await this.prisma.account.delete({ where: { id: accountId } });
    }

    // PRIVATE
    private async changeAccountState(
        userId: number,
        accountId: number,
        state: boolean,
    ) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });

        if (!account || account.userId !== userId) {
            throw new ForbiddenException('Account not found');
        }

        // idempotencia: no actualiza si ya está en ese estado
        if (account.isActive === state) {
            return account;
        }

        return this.prisma.account.update({
            where: { id: accountId },
            data: { isActive: state },
        });
    }
}
