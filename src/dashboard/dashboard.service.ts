import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';

type ActivityKind = 'MOVEMENT' | 'CREDIT_CARD_INSTALLMENT';

export type DashboardActivityItem = {
    kind: ActivityKind;
    id: number;
    description: string | null;
    occurredAt: string;          // Para movimientos: fecha real. Para cuotas: primer día del mes del resumen.
    purchaseDate: string | null; // Solo para cuotas: fecha original de la compra.
    registeredAt: string;        // Fecha de creación del registro (movement.createdAt o purchase.createdAt).
    amountCents: number;
    type: 'INCOME' | 'EXPENSE' | 'STATEMENT_PAYMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'BALANCE_ADJUSTMENT';
    isRecurring: boolean;
    tags: { id: number; name: string; color: string | null }[];
    category: { id: number; name: string; color: string | null; parent: { id: number; name: string; color: string | null } | null } | null;
    account: { id: number; name: string; type: string } | null;
    creditCard: { id: number; name: string; brand: string | null; cardLast4: string } | null;
    installmentInfo: { installmentNumber: number; installmentsCount: number; purchaseId: number; reimbursementAmountCents: number | null; reimbursementAccountId: number | null; reimbursementAt: string | null } | null;
    transferData: { id: number; fromAccountId: number; toAccountId: number; amountCents: number; description: string | null; transferredAt: string; fromAccount: { id: number; name: string }; toAccount: { id: number; name: string } } | null;
    sharedExpense: { sharedAmountCents: number; receivedAmountCents: number; pendingAmountCents: number } | null;
    incomeSource: 'PURCHASE_REIMBURSEMENT' | 'SHARED_REIMBURSEMENT' | null;
    balanceAdjustmentIncreased: boolean | null;
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
                category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true, color: true } } } },
                recurringPayment: { select: { id: true } },
                tags: { select: { id: true, name: true, color: true } },
                transferOut: { select: { id: true, fromAccountId: true, toAccountId: true, amountCents: true, description: true, transferredAt: true, fromAccount: { select: { id: true, name: true } }, toAccount: { select: { id: true, name: true } } } },
                transferIn: { select: { id: true, fromAccountId: true, toAccountId: true, amountCents: true, description: true, transferredAt: true, fromAccount: { select: { id: true, name: true } }, toAccount: { select: { id: true, name: true } } } },
                sharedReimbursements: {
                    where: { isDeleted: false },
                    select: { amountCents: true },
                },
                reimbursedPurchase: { select: { id: true } },
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
                    purchaseId: true,
                    statementId: true,
                    billingCycleOffset: true,
                    installmentNumber: true,
                    amountCents: true,
                    purchase: {
                        include: {
                            creditCard: {
                                select: { id: true, name: true, brand: true, cardLast4: true },
                            },
                            category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true, color: true } } } },
                            sharedReimbursements: {
                                where: { isDeleted: false },
                                select: { amountCents: true },
                            },
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

                const purchaseReceivedCents = inst.purchase.sharedAmountCents
                    ? inst.purchase.sharedReimbursements.reduce((s: number, r: { amountCents: number }) => s + r.amountCents, 0)
                    : 0;

                installmentItems.push({
                    kind: 'CREDIT_CARD_INSTALLMENT',
                    id: inst.id,
                    description: inst.purchase.description,
                    // Fecha del resumen para que el item quede ordenado dentro del período correcto
                    occurredAt: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
                    purchaseDate: inst.purchase.occurredAt.toISOString(),
                    registeredAt: inst.purchase.createdAt.toISOString(),
                    amountCents: inst.amountCents,
                    type: 'EXPENSE',
                    isRecurring: false,
                    tags: [],
                    transferData: null,
                    category: inst.purchase.category ?? null,
                    account: null,
                    creditCard: inst.purchase.creditCard,
                    installmentInfo: {
                        installmentNumber: inst.installmentNumber,
                        installmentsCount: inst.purchase.installmentsCount,
                        purchaseId: inst.purchaseId,
                        reimbursementAmountCents: inst.purchase.reimbursementAmountCents ?? null,
                        reimbursementAccountId: inst.purchase.reimbursementAccountId ?? null,
                        reimbursementAt: inst.purchase.reimbursementAt?.toISOString() ?? null,
                    },
                    sharedExpense: inst.purchase.sharedAmountCents ? {
                        sharedAmountCents: inst.purchase.sharedAmountCents,
                        receivedAmountCents: purchaseReceivedCents,
                        pendingAmountCents: inst.purchase.sharedAmountCents - purchaseReceivedCents,
                    } : null,
                    incomeSource: null,
                    balanceAdjustmentIncreased: null,
                });
            }
        }

        // ── 3. Normalizar movements y combinar ────────────────────────────────
        const movementItems: DashboardActivityItem[] = movements.map(m => {
            const receivedAmountCents = m.sharedAmountCents
                ? m.sharedReimbursements.reduce((s: number, r: { amountCents: number }) => s + r.amountCents, 0)
                : 0;
            return {
                kind: 'MOVEMENT',
                id: m.id,
                description: m.description,
                occurredAt: m.occurredAt.toISOString(),
                purchaseDate: null,
                registeredAt: m.createdAt.toISOString(),
                amountCents: Math.abs(m.amountCents),
                type: m.type === MovementType.INCOME ? 'INCOME'
                    : m.type === MovementType.STATEMENT_PAYMENT ? 'STATEMENT_PAYMENT'
                    : m.type === MovementType.TRANSFER_OUT ? 'TRANSFER_OUT'
                    : m.type === MovementType.TRANSFER_IN ? 'TRANSFER_IN'
                    : m.type === MovementType.BALANCE_ADJUSTMENT ? 'BALANCE_ADJUSTMENT'
                    : 'EXPENSE',
                isRecurring: !!m.recurringPayment,
                tags: m.tags,
                category: m.category ?? null,
                account: m.account,
                creditCard: null,
                installmentInfo: null,
                transferData: m.transferOut
                    ? { ...m.transferOut, transferredAt: m.transferOut.transferredAt.toISOString() }
                    : m.transferIn
                    ? { ...m.transferIn, transferredAt: m.transferIn.transferredAt.toISOString() }
                    : null,
                sharedExpense: m.sharedAmountCents ? {
                    sharedAmountCents: m.sharedAmountCents,
                    receivedAmountCents,
                    pendingAmountCents: m.sharedAmountCents - receivedAmountCents,
                } : null,
                incomeSource: m.reimbursedPurchase ? 'PURCHASE_REIMBURSEMENT'
                    : (m.sharedFromMovementId || m.sharedFromCreditCardPurchaseId) ? 'SHARED_REIMBURSEMENT'
                    : null,
                balanceAdjustmentIncreased: m.type === MovementType.BALANCE_ADJUSTMENT ? m.amountCents > 0 : null,
            };
        });

        const allItems = [...movementItems, ...installmentItems].sort(
            (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );

        return { items: allItems };
    }
}
