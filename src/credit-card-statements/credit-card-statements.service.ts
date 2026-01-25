import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStatementDto } from './dto/create-statement.dto';
import { AccountType, CreditCardInstallmentStatus, CreditCardStatementStatus } from '@prisma/client';
import { PayStatementDto } from './dto/pay-statement.dto';

@Injectable()
export class CreditCardStatementsService {
    constructor(private readonly prisma: PrismaService) { }

    // -----------------------
    // Crear o asegurar statement OPEN
    // -----------------------
    async create(userId: number, dto: CreateStatementDto) {
        const {
            creditCardId,
            year,
            month,
            periodStartDate,
            closingDate,
            dueDate,
        } = dto;

        const card = await this.prisma.creditCard.findFirst({
            where: { id: creditCardId, userId, isActive: true },
        });

        if (!card) {
            throw new ForbiddenException('Invalid credit card');
        }

        const existing = await this.prisma.creditCardStatement.findUnique({
            where: {
                creditCardId_year_month: {
                    creditCardId,
                    year,
                    month,
                },
            },
        });

        if (existing) {
            return existing; // idempotente
        }

        // busco el último statement de la tarjeta
        const lastStatement = await this.prisma.creditCardStatement.findFirst({
            where: {
                creditCardId,
            },
            orderBy: {
                sequenceNumber: 'desc',
            },
        });

        const nextSequenceNumber = lastStatement ? lastStatement.sequenceNumber + 1 : 1;

        return this.prisma.creditCardStatement.create({
            data: {
                userId,
                creditCardId,
                sequenceNumber: nextSequenceNumber,
                year,
                month,
                periodStartDate: new Date(periodStartDate),
                closingDate: new Date(closingDate),
                dueDate: new Date(dueDate),
                status: CreditCardStatementStatus.OPEN,
            },
        });
    }

    // -----------------------
    // Cerrar statement
    // -----------------------
    async close(userId: number, statementId: number) {
        return this.prisma.$transaction(async (tx) => {

            // 1️⃣ Traer statement
            const statement = await tx.creditCardStatement.findUnique({
                where: { id: statementId },
            });

            if (!statement) {
                throw new NotFoundException('Statement not found');
            }

            if (statement.userId !== userId) {
                throw new ForbiddenException();
            }

            if (statement.status !== CreditCardStatementStatus.OPEN) {
                throw new BadRequestException('Statement is not open');
            }

            // traigo cuotas pendientes
            const purchases = await tx.creditCardPurchase.findMany({
                where: {
                    creditCardId: statement.creditCardId,
                    isDeleted: false,

                    OR: [
                        // 🔹 compras en cuotas con algo pendiente
                        {
                            installments: {
                                some: {
                                    status: CreditCardInstallmentStatus.PENDING,
                                },
                            },
                        },

                        // 🔹 compras en 1 pago que corresponden a este statement
                        {
                            installmentsCount: 1,
                            firstStatementSequence: statement.sequenceNumber,
                        },
                    ],
                },
                select: {
                    id: true,
                    installmentsCount: true,
                    firstStatementSequence: true,
                    totalAmountCents: true,

                    installments: {
                        where: {
                            status: CreditCardInstallmentStatus.PENDING,
                        },
                        select: {
                            id: true,
                            amountCents: true,
                            billingCycleOffset: true,
                        },
                    },
                },
            });

            const installmentsToBill = purchases.flatMap((purchase) =>
                purchase.installments.filter(
                    (installment) =>
                        purchase.installmentsCount > 1 &&
                        purchase.firstStatementSequence + installment.billingCycleOffset === statement.sequenceNumber,
                ),
            );

            const installmentsTotal = installmentsToBill.reduce(
                (sum, i) => sum + i.amountCents,
                0,
            );


            // marco las cuotas como BIILED
            if (installmentsToBill.length > 0) {
                await tx.creditCardInstallment.updateMany({
                    where: {
                        id: { in: installmentsToBill.map((i) => i.id) },
                    },
                    data: {
                        status: CreditCardInstallmentStatus.BILLED,
                        statementId: statement.id,
                        year: statement.year,
                        month: statement.month,
                    },
                });
            }

            // traigo las compras en un unico pago dentro del período del statement
            const singlePaymentPurchases = purchases.filter(
                (purchase) =>
                    purchase.installmentsCount === 1 &&
                    purchase.firstStatementSequence === statement.sequenceNumber,
            );

            // total de compras en un unico pago
            const singlePaymentsTotal = singlePaymentPurchases.reduce(
                (sum, p) => sum + p.totalAmountCents,
                0,
            );

            // monto total del statement
            const totalCents = installmentsTotal + singlePaymentsTotal;

            // 6️⃣ Cerrar statement
            return tx.creditCardStatement.update({
                where: { id: statement.id },
                data: {
                    status: CreditCardStatementStatus.CLOSED,
                    totalCents,
                },
            });
        });
    }


    async pay(
        userId: number,
        statementId: number,
        dto: PayStatementDto,
    ) {
        const { accountId, description, paidAt } = dto;

        return this.prisma.$transaction(async (tx) => {

            // 1️⃣ Traer statement
            const statement = await tx.creditCardStatement.findUnique({
                where: { id: statementId },
            });

            if (!statement) {
                throw new NotFoundException('Statement not found');
            }

            if (statement.userId !== userId) {
                throw new ForbiddenException();
            }

            if (statement.status === CreditCardStatementStatus.OPEN) {
                throw new BadRequestException('Statement is not closed');
            }

            if (statement.status === CreditCardStatementStatus.PAID) {
                throw new BadRequestException('Statement already paid');
            }

            if (statement.totalCents <= 0) {
                throw new BadRequestException('Statement total is zero');
            }

            // 2️⃣ Validar cuenta de pago
            const account = await tx.account.findFirst({
                where: {
                    id: accountId,
                    userId,
                    isActive: true,
                    type: {
                        in: [
                            AccountType.CASH,
                            AccountType.BANK,
                            AccountType.WALLET,
                        ],
                    },
                },
            });

            if (!account) {
                throw new BadRequestException(
                    'Payment account must be CASH, BANK or WALLET',
                );
            }

            // 3️⃣ Crear movimiento (EXPENSE)
            const newBalance =
                account.currentBalanceCents - statement.totalCents;

            if (newBalance < 0) {
                throw new BadRequestException('Insufficient account balance');
            }

            await tx.movement.create({
                data: {
                    userId,
                    accountId,
                    type: 'EXPENSE',
                    amountCents: statement.totalCents,
                    occurredAt: paidAt ? new Date(paidAt) : new Date(),
                    description:
                        description ??
                        `Pago resumen tarjeta ${statement.creditCardId} ${statement.month}/${statement.year}`,
                    balanceSnapshotCents: newBalance,
                },
            });

            await tx.account.update({
                where: { id: account.id },
                data: { currentBalanceCents: newBalance },
            });

            // 4️⃣ Marcar cuotas como PAID
            await tx.creditCardInstallment.updateMany({
                where: {
                    statementId: statement.id,
                    status: CreditCardInstallmentStatus.BILLED,
                },
                data: {
                    status: CreditCardInstallmentStatus.PAID,
                },
            });

            // 5️⃣ Marcar statement como PAID
            return tx.creditCardStatement.update({
                where: { id: statement.id },
                data: {
                    status: CreditCardStatementStatus.PAID,
                },
            });
        });
    }

}
