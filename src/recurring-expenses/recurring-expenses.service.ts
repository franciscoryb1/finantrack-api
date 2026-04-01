import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, RecurringFrequency } from '@prisma/client';
import { CreateRecurringExpenseDto } from './dto/create-recurring-expense.dto';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto';
import { PayRecurringExpenseDto } from './dto/pay-recurring-expense.dto';
import { GetUpcomingDto } from './dto/get-upcoming.dto';
import { CreditCardPurchasesService } from '../credit-card-purchases/credit-card-purchases.service';

@Injectable()
export class RecurringExpensesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly creditCardPurchasesService: CreditCardPurchasesService,
    ) { }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private getExpectedDueDates(
        startDate: Date,
        frequency: RecurringFrequency,
        upTo: Date,
        dueDay?: number | null,
        dueDayOfWeek?: number | null,
    ): Date[] {
        const dates: Date[] = [];
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        if (frequency === RecurringFrequency.MONTHLY && dueDay) {
            // Clamp dueDay al último día del mes (ej: dueDay=31 en febrero → 28/29)
            const clampedDay = (y: number, m: number) =>
                Math.min(dueDay, new Date(y, m + 1, 0).getDate());

            let year = startDate.getFullYear();
            let month = startDate.getMonth();
            let current = new Date(year, month, clampedDay(year, month), 12, 0, 0);

            if (current < startDate) {
                month++;
                if (month > 11) { month = 0; year++; }
                current = new Date(year, month, clampedDay(year, month), 12, 0, 0);
            }

            while (current <= upTo) {
                dates.push(new Date(current));
                month++;
                if (month > 11) { month = 0; year++; }
                current = new Date(year, month, clampedDay(year, month), 12, 0, 0);
            }

        } else if (
            (frequency === RecurringFrequency.WEEKLY || frequency === RecurringFrequency.BIWEEKLY) &&
            dueDayOfWeek != null
        ) {
            const intervalDays = frequency === RecurringFrequency.WEEKLY ? 7 : 14;

            // Avanzar desde startDate hasta encontrar el primer día de semana correcto
            let current = new Date(startDate);
            current.setHours(12, 0, 0, 0);

            while (current.getDay() !== dueDayOfWeek) {
                current = new Date(current.getTime() + MS_PER_DAY);
            }

            while (current <= upTo) {
                dates.push(new Date(current));
                current = new Date(current.getTime() + intervalDays * MS_PER_DAY);
            }

        } else {
            // Sin restricción de día: ancla directamente en startDate
            let current = new Date(startDate);
            current.setHours(12, 0, 0, 0);

            while (current <= upTo) {
                dates.push(new Date(current));

                if (frequency === RecurringFrequency.WEEKLY) {
                    current = new Date(current.getTime() + 7 * MS_PER_DAY);
                } else if (frequency === RecurringFrequency.BIWEEKLY) {
                    current = new Date(current.getTime() + 14 * MS_PER_DAY);
                } else {
                    const d = new Date(current);
                    d.setMonth(d.getMonth() + 1);
                    current = d;
                }
            }
        }

        return dates;
    }

    private normalizeDate(date: Date): string {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        return d.toISOString();
    }

    private async validateCategory(userId: number, categoryId?: number | null) {
        if (!categoryId) return;
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, OR: [{ userId }, { userId: null }] },
            select: { id: true },
        });
        if (!category) throw new BadRequestException('Invalid category');
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    async create(userId: number, dto: CreateRecurringExpenseDto) {
        const { name, description, amountCents, frequency, dueDay, dueDayOfWeek, startDate, endDate, categoryId } = dto;

        await this.validateCategory(userId, categoryId);

        return this.prisma.recurringExpense.create({
            data: {
                userId,
                name,
                description,
                amountCents,
                frequency,
                dueDay: frequency === 'MONTHLY' ? (dueDay ?? null) : null,
                dueDayOfWeek: (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') ? (dueDayOfWeek ?? null) : null,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                categoryId,
            },
            include: {
                category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true } } } },
            },
        });
    }

    async list(userId: number) {
        return this.prisma.recurringExpense.findMany({
            where: { userId },
            orderBy: [{ name: 'asc' }],
            include: {
                category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true } } } },
                payments: {
                    orderBy: { dueDate: 'desc' },
                    take: 1,
                    select: { dueDate: true, amountCents: true },
                },
            },
        });
    }

    async update(userId: number, id: number, dto: UpdateRecurringExpenseDto) {
        const expense = await this.prisma.recurringExpense.findFirst({ where: { id, userId } });
        if (!expense) throw new NotFoundException('Recurring expense not found');

        if (dto.categoryId !== undefined) {
            await this.validateCategory(userId, dto.categoryId);
        }

        return this.prisma.recurringExpense.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description || null }),
                ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
                ...(dto.dueDay !== undefined && { dueDay: dto.dueDay }),
                ...(dto.dueDayOfWeek !== undefined && { dueDayOfWeek: dto.dueDayOfWeek }),
                ...(dto.frequency !== undefined && { frequency: dto.frequency }),
                ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
                ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
                ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
            },
            include: {
                category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true } } } },
            },
        });
    }

    async remove(userId: number, id: number) {
        const expense = await this.prisma.recurringExpense.findFirst({ where: { id, userId } });
        if (!expense) throw new NotFoundException('Recurring expense not found');

        await this.prisma.recurringExpense.delete({ where: { id } });
    }

    // ── Upcoming ─────────────────────────────────────────────────────────────

    async getUpcoming(userId: number, query: GetUpcomingDto) {
        const { year, month } = query;

        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        const expenses = await this.prisma.recurringExpense.findMany({
            where: {
                userId,
                startDate: { lte: periodEnd },
                OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
            },
            include: {
                category: { select: { id: true, name: true, color: true, parent: { select: { id: true, name: true } } } },
                payments: {
                    where: {
                        dueDate: { gte: periodStart, lte: periodEnd },
                    },
                    include: {
                        movement: {
                            select: {
                                id: true,
                                occurredAt: true,
                                account: { select: { id: true, name: true } },
                            },
                        },
                        creditCardPurchase: {
                            select: {
                                id: true,
                                creditCard: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
        });

        const now = new Date();
        const results: Array<{
            recurringExpense: any;
            dueDate: string;
            status: 'PAID' | 'PENDING' | 'OVERDUE';
            payment?: {
                id: number;
                amountCents: number;
                movementId?: number | null;
                creditCardPurchaseId?: number | null;
                createdAt: Date;
                accountName?: string;
                creditCardName?: string;
            };
        }> = [];

        for (const expense of expenses) {
            const expectedDates = this.getExpectedDueDates(expense.startDate, expense.frequency, periodEnd, expense.dueDay, expense.dueDayOfWeek);

            for (const dueDate of expectedDates) {
                if (dueDate < periodStart || dueDate > periodEnd) continue;
                if (expense.endDate && dueDate > expense.endDate) continue;

                const dueDateNorm = this.normalizeDate(dueDate);
                const payment = expense.payments.find(
                    (p) => this.normalizeDate(p.dueDate) === dueDateNorm,
                );

                let status: 'PAID' | 'PENDING' | 'OVERDUE';
                if (payment) {
                    status = 'PAID';
                } else if (dueDate < now) {
                    status = 'OVERDUE';
                } else {
                    status = 'PENDING';
                }

                results.push({
                    recurringExpense: {
                        id: expense.id,
                        name: expense.name,
                        description: expense.description,
                        amountCents: expense.amountCents,
                        frequency: expense.frequency,
                        dueDay: expense.dueDay,
                        dueDayOfWeek: expense.dueDayOfWeek,
                        category: expense.category,
                    },
                    dueDate: dueDate.toISOString(),
                    status,
                    payment: payment
                        ? {
                              id: payment.id,
                              amountCents: payment.amountCents,
                              movementId: payment.movementId,
                              creditCardPurchaseId: payment.creditCardPurchaseId,
                              createdAt: payment.createdAt,
                              accountName: payment.movement?.account?.name,
                              creditCardName: payment.creditCardPurchase?.creditCard?.name,
                          }
                        : undefined,
                });
            }
        }

        results.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        return results;
    }

    // ── Pay ───────────────────────────────────────────────────────────────────

    async pay(userId: number, id: number, dto: PayRecurringExpenseDto) {
        const { dueDate, amountCents, occurredAt, accountId, creditCardId, installmentsCount } = dto;

        if (!accountId && !creditCardId) {
            throw new BadRequestException('Either accountId or creditCardId must be provided');
        }

        const expense = await this.prisma.recurringExpense.findFirst({
            where: { id, userId },
            include: { category: true },
        });
        if (!expense) throw new NotFoundException('Recurring expense not found');

        const dueDateObj = new Date(dueDate);
        dueDateObj.setUTCHours(0, 0, 0, 0);

        const existing = await this.prisma.recurringExpensePayment.findFirst({
            where: { recurringExpenseId: id, dueDate: dueDateObj },
        });
        if (existing) throw new ConflictException('This occurrence has already been paid');

        if (creditCardId) {
            // Pago con tarjeta de crédito: crea una compra con cuotas
            const purchase = await this.creditCardPurchasesService.create(userId, {
                creditCardId,
                categoryId: expense.categoryId ?? undefined,
                totalAmountCents: amountCents,
                installmentsCount: installmentsCount ?? 1,
                occurredAt,
                description: expense.name,
            } as any);

            const payment = await this.prisma.recurringExpensePayment.create({
                data: {
                    recurringExpenseId: id,
                    creditCardPurchaseId: purchase.id,
                    dueDate: dueDateObj,
                    amountCents,
                },
            });

            return { payment, purchase };
        }

        // Pago con cuenta (flujo original)
        return this.prisma.$transaction(async (tx) => {
            const account = await tx.account.findFirst({
                where: { id: accountId!, userId, isActive: true },
                select: { id: true, currentBalanceCents: true },
            });
            if (!account) throw new ForbiddenException('Account not found or inactive');

            const newBalance = account.currentBalanceCents - amountCents;
            if (newBalance < 0) throw new BadRequestException('Insufficient account balance');

            const movement = await tx.movement.create({
                data: {
                    userId,
                    accountId: accountId!,
                    categoryId: expense.categoryId,
                    type: MovementType.EXPENSE,
                    amountCents,
                    occurredAt: new Date(occurredAt),
                    description: expense.name,
                    balanceSnapshotCents: newBalance,
                },
            });

            await tx.account.update({
                where: { id: accountId! },
                data: { currentBalanceCents: newBalance },
            });

            const payment = await tx.recurringExpensePayment.create({
                data: {
                    recurringExpenseId: id,
                    movementId: movement.id,
                    dueDate: dueDateObj,
                    amountCents,
                },
            });

            return { payment, movement };
        });
    }
}
