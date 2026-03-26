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
                backgroundColor: true,
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

        // 2️⃣ Statements OPEN por tarjeta — ordenados desc para quedarnos con el más reciente por tarjeta
        const openStatements = await this.prisma.creditCardStatement.findMany({
            where: {
                userId,
                creditCardId: { in: cardIds },
                status: CreditCardStatementStatus.OPEN,
            },
            orderBy: { sequenceNumber: 'desc' },
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

        // Solo conservamos el statement más reciente por tarjeta (el primero en el array desc)
        const openMap = new Map<number, typeof openStatements[number]>();
        openStatements.forEach(st => {
            if (!openMap.has(st.creditCardId)) openMap.set(st.creditCardId, st);
        });

        // 3️⃣ Statement del período actual (mes en curso) — sin importar el status
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const currentPeriodStatements = await this.prisma.creditCardStatement.findMany({
            where: {
                userId,
                creditCardId: { in: cardIds },
                year: currentYear,
                month: currentMonth,
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

        const currentPeriodMap = new Map<number, typeof currentPeriodStatements[number]>();
        currentPeriodStatements.forEach(st => currentPeriodMap.set(st.creditCardId, st));

        // 4️⃣ Traer cuotas activas
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
            const currentPeriodSt = currentPeriodMap.get(card.id);

            let committedCents = 0;
            let openStatementAccumulatedCents = 0;
            let currentPeriodAccumulatedCents = 0;
            let activeInstallmentsCount = 0;

            const cardInstallments = installments.filter(
                i => i.purchase.creditCardId === card.id
            );

            for (const inst of cardInstallments) {

                committedCents += inst.amountCents;
                totalDebtCents += inst.amountCents;

                activeInstallmentsCount++;

                const instSequence = inst.purchase.firstStatementSequence + inst.billingCycleOffset;

                if (
                    openStatement &&
                    inst.status === 'PENDING' &&
                    instSequence === openStatement.sequenceNumber
                ) {
                    openStatementAccumulatedCents += inst.amountCents;
                    totalNextStatementCents += inst.amountCents;
                }

                if (
                    currentPeriodSt &&
                    instSequence === currentPeriodSt.sequenceNumber
                ) {
                    currentPeriodAccumulatedCents += inst.amountCents;
                }
            }

            return {
                cardId: card.id,
                name: card.name,
                brand: card.brand ?? null,
                limitCents: card.limitCents,
                backgroundColor: card.backgroundColor,

                committedCents,
                availableCents: card.limitCents - committedCents,

                openStatementAccumulatedCents,
                currentPeriodAccumulatedCents,
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

                currentPeriodStatement: (() => {
                    const st = currentPeriodMap.get(card.id);
                    if (!st) return null;
                    return {
                        id: st.id,
                        sequenceNumber: st.sequenceNumber,
                        year: st.year,
                        month: st.month,
                        closingDate: st.closingDate.toISOString(),
                        dueDate: st.dueDate.toISOString(),
                    };
                })(),
            };
        });

        return {
            totalDebtCents,
            totalNextStatementCents,
            cards: cardsOutput,
        };
    }

    async getCardPeriodDetail(
        userId: number,
        cardId: number,
        year?: number,
        month?: number,
    ) {

        const card = await this.prisma.creditCard.findFirst({
            where: { id: cardId, userId },
            select: { id: true, name: true, limitCents: true, backgroundColor: true },
        });

        if (!card) throw new Error('Card not found');

        let statement;

        if (year && month) {
            statement = await this.prisma.creditCardStatement.findFirst({
                where: { creditCardId: cardId, year, month },
            });
        } else {
            statement = await this.prisma.creditCardStatement.findFirst({
                where: {
                    creditCardId: cardId,
                    status: 'OPEN',
                },
            });
        }

        if (!statement) throw new Error('Statement not found');

        const allInstallments = await this.prisma.creditCardInstallment.findMany({
            where: {
                purchase: {
                    creditCardId: cardId,
                    isDeleted: false,
                },
            },
            include: {
                purchase: {
                    include: {
                        category: {
                            select: { id: true, name: true, color: true, parent: { select: { id: true, name: true, color: true } } },
                        },
                        tags: { select: { id: true, name: true, color: true } },
                    },
                },
            },
        });

        const purchasesMap = new Map<number, any>();

        for (const inst of allInstallments) {

            const belongsToPeriod =
                inst.purchase.firstStatementSequence + inst.billingCycleOffset ===
                statement.sequenceNumber;

            if (!belongsToPeriod) continue;

            if (!purchasesMap.has(inst.purchaseId)) {

                const paidCount = await this.prisma.creditCardInstallment.count({
                    where: {
                        purchaseId: inst.purchaseId,
                        status: 'PAID',
                    },
                });

                purchasesMap.set(inst.purchaseId, {
                    purchaseId: inst.purchase.id,
                    description: inst.purchase.description,
                    totalAmountCents: inst.purchase.totalAmountCents,
                    installmentsCount: inst.purchase.installmentsCount,
                    installmentsPaid: paidCount,
                    occurredAt: inst.purchase.occurredAt.toISOString(),
                    installmentsRemaining:
                        inst.purchase.installmentsCount - paidCount,
                    isCredit: inst.purchase.isCredit,
                    tags: inst.purchase.tags,
                    category: inst.purchase.category
                        ? {
                              id: inst.purchase.category.id,
                              name: inst.purchase.category.name,
                              color: inst.purchase.category.color ?? null,
                              parent: inst.purchase.category.parent
                                  ? { id: inst.purchase.category.parent.id, name: inst.purchase.category.parent.name, color: inst.purchase.category.parent.color ?? null }
                                  : null,
                          }
                        : null,
                    installmentForThisPeriod: {
                        installmentNumber: inst.installmentNumber,
                        amountCents: inst.amountCents,
                        status: inst.status,
                    },
                });
            }
        }

        return {
            card,
            period: {
                id: statement.id,
                year: statement.year,
                month: statement.month,
                totalCents: statement.totalCents,
                closingDate: statement.closingDate.toISOString(),
                dueDate: statement.dueDate.toISOString(),
                status: statement.status,
            },
            purchases: Array.from(purchasesMap.values()),
        };
    }

    async getCardPeriods(userId: number, cardId: number) {

        const card = await this.prisma.creditCard.findFirst({
            where: { id: cardId, userId },
        });

        if (!card) throw new Error("Card not found");

        const periods = await this.prisma.creditCardStatement.findMany({
            where: {
                creditCardId: cardId,
                userId,
            },
            orderBy: [
                { year: 'desc' },
                { month: 'desc' },
            ],
            select: {
                year: true,
                month: true,
                status: true,
                periodStartDate: true,
                closingDate: true,
            },
        });

        return periods.map((p) => ({
            year: p.year,
            month: p.month,
            status: p.status,
            periodStartDate: p.periodStartDate.toISOString(),
            closingDate: p.closingDate.toISOString(),
        }));
    }
}