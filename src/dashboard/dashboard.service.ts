import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';

type ActivityKind = 'MOVEMENT' | 'CREDIT_CARD_INSTALLMENT';

export type DashboardActivityItem = {
    kind: ActivityKind;
    id: number;
    description: string | null;
    occurredAt: string;       // Para movimientos: fecha real. Para cuotas: primer día del mes del resumen.
    purchaseDate: string | null; // Solo para cuotas: fecha original de la compra.
    amountCents: number;
    type: 'INCOME' | 'EXPENSE';
    category: { id: number; name: string } | null;
    account: { id: number; name: string; type: string } | null;
    creditCard: { id: number; name: string; brand: string | null; cardLast4: string } | null;
    installmentInfo: { installmentNumber: number; installmentsCount: number } | null;
};

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getActivity(userId: number, year: number, month: number): Promise<{ items: DashboardActivityItem[] }> {
        const fromDate = new Date(Date.UTC(year, month - 1, 1));
        const toDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        // ── 1. Movements del período ──────────────────────────────────────────
        const movements = await this.prisma.movement.findMany({
            where: {
                userId,
                isDeleted: false,
                occurredAt: { gte: fromDate, lte: toDate },
            },
            include: {
                account: { select: { id: true, name: true, type: true } },
                category: { select: { id: true, name: true } },
            },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });

        // ── 2. Cuotas de tarjeta para el período ──────────────────────────────
        // Buscar los statements que corresponden a este año/mes (uno por tarjeta)
        const statements = await this.prisma.creditCardStatement.findMany({
            where: { userId, year, month },
            select: { id: true, creditCardId: true, sequenceNumber: true },
        });

        const installmentItems: DashboardActivityItem[] = [];

        if (statements.length > 0) {
            // Mapa: creditCardId → sequenceNumber del statement de este período
            const sequenceMap = new Map<number, number>();
            // Mapa: statementId → creditCardId (para matching por statementId directo)
            const statementIdSet = new Set<number>();
            statements.forEach(s => {
                sequenceMap.set(s.creditCardId, s.sequenceNumber);
                statementIdSet.add(s.id);
            });

            const cardIds = statements.map(s => s.creditCardId);

            // Traer todas las cuotas de esas tarjetas (en memoria filtramos por período)
            const allInstallments = await this.prisma.creditCardInstallment.findMany({
                where: {
                    userId,
                    purchase: {
                        isDeleted: false,
                        creditCardId: { in: cardIds },
                    },
                },
                select: {
                    id: true,
                    statementId: true,
                    billingCycleOffset: true,
                    installmentNumber: true,
                    amountCents: true,
                    purchase: {
                        include: {
                            creditCard: {
                                select: { id: true, name: true, brand: true, cardLast4: true },
                            },
                            category: { select: { id: true, name: true } },
                        },
                    },
                },
            });

            for (const inst of allInstallments) {
                const stmtSequence = sequenceMap.get(inst.purchase.creditCardId);
                if (stmtSequence === undefined) continue;

                const belongsToPeriod =
                    (inst.statementId !== null && statementIdSet.has(inst.statementId)) ||
                    inst.purchase.firstStatementSequence + inst.billingCycleOffset === stmtSequence;

                if (!belongsToPeriod) continue;

                installmentItems.push({
                    kind: 'CREDIT_CARD_INSTALLMENT',
                    id: inst.id,
                    description: inst.purchase.description,
                    // Fecha del resumen para que el item quede ordenado dentro del período correcto
                    occurredAt: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
                    purchaseDate: inst.purchase.occurredAt.toISOString(),
                    amountCents: inst.amountCents,
                    type: 'EXPENSE',
                    category: inst.purchase.category ?? null,
                    account: null,
                    creditCard: inst.purchase.creditCard,
                    installmentInfo: {
                        installmentNumber: inst.installmentNumber,
                        installmentsCount: inst.purchase.installmentsCount,
                    },
                });
            }
        }

        // ── 3. Normalizar movements y combinar ────────────────────────────────
        const movementItems: DashboardActivityItem[] = movements.map(m => ({
            kind: 'MOVEMENT',
            id: m.id,
            description: m.description,
            occurredAt: m.occurredAt.toISOString(),
            purchaseDate: null,
            amountCents: m.amountCents,
            type: m.type === MovementType.INCOME ? 'INCOME' : 'EXPENSE',
            category: m.category ?? null,
            account: m.account,
            creditCard: null,
            installmentInfo: null,
        }));

        const allItems = [...movementItems, ...installmentItems].sort(
            (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );

        return { items: allItems };
    }
}
