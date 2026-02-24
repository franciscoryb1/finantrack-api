import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { AccountType } from '@prisma/client';

@Injectable()
export class CreditCardsService {
    constructor(private readonly prisma: PrismaService) { }

    async list(userId: number) {
        return this.prisma.creditCard.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                bankAccount: { select: { id: true, name: true } },
            },
        });
    }

    async create(userId: number, dto: CreateCreditCardDto) {
        const bankAccount = await this.prisma.account.findFirst({
            where: {
                id: dto.bankAccountId,
                userId,
                isActive: true,
                type: AccountType.BANK,
            },
        });

        if (!bankAccount) {
            throw new BadRequestException('Invalid bank account');
        }

        return this.prisma.creditCard.create({
            data: {
                userId,
                name: dto.name,
                brand: dto.brand,
                limitCents: dto.limitCents,
                closingDay: dto.closingDay,
                dueDay: dto.dueDay,
                cardLast4: dto.cardLast4,
                cardExpiresAt: new Date(dto.cardExpiresAt),
                bankAccountId: dto.bankAccountId,
            },
        });
    }

    async update(userId: number, cardId: number, dto: UpdateCreditCardDto) {
        const card = await this.prisma.creditCard.findUnique({
            where: { id: cardId },
        });

        if (!card) throw new NotFoundException('Card not found');
        if (card.userId !== userId) throw new ForbiddenException();

        if (dto.bankAccountId) {
            const bankAccount = await this.prisma.account.findFirst({
                where: {
                    id: dto.bankAccountId,
                    userId,
                    isActive: true,
                    type: AccountType.BANK,
                },
            });

            if (!bankAccount) {
                throw new BadRequestException('Invalid bank account');
            }
        }

        return this.prisma.creditCard.update({
            where: { id: cardId },
            data: {
                ...dto,
                ...(dto.cardExpiresAt && { cardExpiresAt: new Date(dto.cardExpiresAt) }),
            },
        });
    }

    async setActive(userId: number, cardId: number, isActive: boolean) {
        const card = await this.prisma.creditCard.findUnique({
            where: { id: cardId },
        });

        if (!card) throw new NotFoundException('Card not found');
        if (card.userId !== userId) throw new ForbiddenException();

        return this.prisma.creditCard.update({
            where: { id: cardId },
            data: { isActive },
        });
    }

    async getSummary(userId: number, cardId: number) {
        const card = await this.prisma.creditCard.findFirst({
            where: { id: cardId, userId },
        });

        if (!card) throw new NotFoundException();

        const pending = await this.prisma.creditCardInstallment.aggregate({
            where: {
                purchase: { creditCardId: cardId },
                status: { in: ['PENDING', 'BILLED'] },
            },
            _sum: { amountCents: true },
        });

        const openStatement = await this.prisma.creditCardStatement.findFirst({
            where: {
                creditCardId: cardId,
                status: 'OPEN',
            },
        });

        return {
            limitCents: card.limitCents,
            committedCents: pending._sum.amountCents ?? 0,
            availableCents:
                card.limitCents - (pending._sum.amountCents ?? 0),
            openStatement,
        };
    }
}
