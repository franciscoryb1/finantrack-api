import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditCardStatementStatus } from '@prisma/client';
import { InstallmentsOverviewResponseDto } from './dto/installments-overview.dto';

@Injectable()
export class InstallmentsService {
    constructor(private readonly prisma: PrismaService) { }

    async getOverview(userId: number): Promise<InstallmentsOverviewResponseDto> {

        // 1️⃣ Tarjetas activas
        const cards = await this.prisma.creditCard.findMany({
            where: { userId, isActive: true },
            select: {
                id: true,
                name: true,
                brand: true,
                limitCents: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (cards.length === 0) {
            return {
                totalDebtCents: 0,
                totalNextStatementCents: 0,
                cards: [],
            };
        }

        const cardIds = cards.map(c => c.id);

        // 2️⃣ Statements OPEN por tarjeta
        const openStatements = await this.prisma.creditCardStatement.findMany({
            where: {
                userId,
                creditCardId: { in: cardIds },
                status: CreditCardStatementStatus.OPEN,
            },
            select: {
                id: true,
                creditCardId: true,
                sequenceNumber: true,
                year: true,
                month: true,
                closingDate: true,
                dueDate: true,
            },
        });

        const openMap = new Map<number, typeof openStatements[number]>();
        openStatements.forEach(st => openMap.set(st.creditCardId, st));

        // 3️⃣ Traer cuotas activas
        const installments = await this.prisma.creditCardInstallment.findMany({
            where: {
                userId,
                status: { in: ['PENDING', 'BILLED'] },
                purchase: {
                    creditCardId: { in: cardIds },
                    isDeleted: false,
                },
            },
            select: {
                amountCents: true,
                status: true,
                billingCycleOffset: true,
                purchase: {
                    select: {
                        creditCardId: true,
                        firstStatementSequence: true,
                    },
                },
            },
        });

        let totalDebtCents = 0;
        let totalNextStatementCents = 0;

        const cardsOutput = cards.map(card => {

            const openStatement = openMap.get(card.id);

            let committedCents = 0;
            let openStatementAccumulatedCents = 0;
            let activeInstallmentsCount = 0;

            const cardInstallments = installments.filter(
                i => i.purchase.creditCardId === card.id
            );

            for (const inst of cardInstallments) {

                committedCents += inst.amountCents;
                totalDebtCents += inst.amountCents;

                activeInstallmentsCount++;

                // 🔥 Solo contar para próximo resumen si:
                // - Existe statement OPEN
                // - La cuota es PENDING
                // - Pertenece al ciclo actual
                if (
                    openStatement &&
                    inst.status === 'PENDING' &&
                    inst.purchase.firstStatementSequence + inst.billingCycleOffset ===
                    openStatement.sequenceNumber
                ) {
                    openStatementAccumulatedCents += inst.amountCents;
                    totalNextStatementCents += inst.amountCents;
                }
            }

            return {
                cardId: card.id,
                name: card.name,
                brand: card.brand ?? null,
                limitCents: card.limitCents,

                committedCents,
                availableCents: card.limitCents - committedCents,

                openStatementAccumulatedCents,
                activeInstallmentsCount,

                openStatement: openStatement
                    ? {
                        id: openStatement.id,
                        sequenceNumber: openStatement.sequenceNumber,
                        year: openStatement.year,
                        month: openStatement.month,
                        closingDate: openStatement.closingDate.toISOString(),
                        dueDate: openStatement.dueDate.toISOString(),
                    }
                    : null,
            };
        });

        return {
            totalDebtCents,
            totalNextStatementCents,
            cards: cardsOutput,
        };
    }
}