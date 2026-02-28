import {
    Injectable,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';

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

    // ACTIVATE / DEACTIVATE
    async deactivateAccount(userId: number, accountId: number) {
        return this.changeAccountState(userId, accountId, false);
    }

    async activateAccount(userId: number, accountId: number) {
        return this.changeAccountState(userId, accountId, true);
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
