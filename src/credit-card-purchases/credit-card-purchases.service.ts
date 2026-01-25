import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CategoryType, CreditCardInstallmentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CreditCardPurchasesService {
    constructor(private readonly prisma: PrismaService) { }

    // ---------- helpers ----------

    private async validateCategory(userId: number, categoryId?: number | null) {
        if (!categoryId) return;

        const category = await this.prisma.category.findFirst({
            where: {
                id: categoryId,
                type: CategoryType.EXPENSE,
                isActive: true,
                OR: [{ userId }, { userId: null }],
            },
        });

        if (!category) {
            throw new BadRequestException('Invalid category');
        }
    }

    private async validateCard(userId: number, creditCardId: number) {
        const card = await this.prisma.creditCard.findFirst({
            where: { id: creditCardId, userId, isActive: true },
        });

        if (!card) {
            throw new ForbiddenException('Credit card not found or inactive');
        }

        return card;
    }

    private async hasBilledInstallments(purchaseId: number) {
        const count = await this.prisma.creditCardInstallment.count({
            where: {
                purchaseId,
                status: { in: ['BILLED', 'PAID'] },
            },
        });

        return count > 0;
    }

    private async hasClosedStatement(purchaseId: number) {
        const count = await this.prisma.creditCardInstallment.count({
            where: {
                purchaseId,
                statement: {
                    status: { in: ['CLOSED', 'PAID'] },
                },
            },
        });

        return count > 0;
    }


    // ---------- core ----------

    async create(userId: number, dto: CreatePurchaseDto) {
        const {
            creditCardId,
            categoryId,
            totalAmountCents,
            installmentsCount,
            occurredAt,
            description,
        } = dto;

        // valido categoria y tarjeta
        await this.validateCategory(userId, categoryId);
        const creditCard = await this.validateCard(userId, creditCardId);

        const occurredDate = new Date(occurredAt);

        return this.prisma.$transaction(async (tx) => {

            // validar limite de la tarjeta
            const committed = await tx.creditCardInstallment.aggregate({
                where: {
                    purchase: { userId, creditCardId },
                    status: { in: ['PENDING', 'BILLED'] },
                },
                _sum: { amountCents: true },
            });

            const committedCents = committed._sum.amountCents ?? 0;

            if (committedCents + totalAmountCents > creditCard.limitCents) {
                throw new BadRequestException('Credit card limit exceeded');
            }


            // busco el último statement de la tarjeta
            // busco un statement OPEN
            const openStatement = await tx.creditCardStatement.findFirst({
                where: {
                    creditCardId,
                    status: 'OPEN',
                },
            });

            let firstStatementSequence: number;

            if (openStatement) {
                // valido si la compra cae dentro del período del statement
                if (
                    occurredDate < openStatement.periodStartDate ||
                    occurredDate >= openStatement.closingDate
                ) {
                    throw new BadRequestException(
                        'Purchase date is outside the open statement period',
                    );
                }

                firstStatementSequence = openStatement.sequenceNumber;
            } else {
                // no hay statement abierto → empieza en el próximo
                const lastStatement = await tx.creditCardStatement.findFirst({
                    where: { creditCardId },
                    orderBy: { sequenceNumber: 'desc' },
                });

                firstStatementSequence = lastStatement
                    ? lastStatement.sequenceNumber + 1
                    : 1;
            }


            // crear compra
            const purchase = await tx.creditCardPurchase.create({
                data: {
                    userId,
                    creditCardId,
                    categoryId,
                    totalAmountCents,
                    installmentsCount,
                    occurredAt: occurredDate,
                    description,
                    firstStatementSequence,
                },
            });

            // generar cuotas
            if (installmentsCount > 1) {
                const baseAmount = Math.floor(totalAmountCents / installmentsCount);
                const remainder = totalAmountCents % installmentsCount;

                const installmentsData: Prisma.CreditCardInstallmentCreateManyInput[] = [];

                for (let i = 1; i <= installmentsCount; i++) {
                    const amount = i === 1 ? baseAmount + remainder : baseAmount;

                    installmentsData.push({
                        userId,
                        purchaseId: purchase.id,
                        installmentNumber: i,
                        billingCycleOffset: i - 1,
                        amountCents: amount,
                        status: CreditCardInstallmentStatus.PENDING,
                        year: null,
                        month: null,
                    });
                }

                await tx.creditCardInstallment.createMany({
                    data: installmentsData,
                });
            }

            return purchase;
        });
    }



    async update(userId: number, purchaseId: number, dto: UpdatePurchaseDto) {
        const purchase = await this.prisma.creditCardPurchase.findUnique({
            where: { id: purchaseId },
        });

        if (!purchase || purchase.isDeleted) {
            throw new NotFoundException('Purchase not found');
        }

        if (purchase.userId !== userId) {
            throw new ForbiddenException();
        }

        if (
            await this.hasBilledInstallments(purchaseId) ||
            await this.hasClosedStatement(purchaseId)
        ) {
            throw new BadRequestException(
                'Cannot modify purchase linked to a closed statement',
            );
        }



        if (dto.categoryId !== undefined) {
            await this.validateCategory(userId, dto.categoryId);
        }

        return this.prisma.$transaction(async (tx) => {
            // si cambian monto o cuotas → borramos installments y regeneramos
            const mustRegenerate =
                dto.totalAmountCents !== undefined ||
                dto.installmentsCount !== undefined ||
                dto.occurredAt !== undefined;

            if (mustRegenerate) {
                await tx.creditCardInstallment.deleteMany({
                    where: { purchaseId },
                });
            }

            const updated = await tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: {
                    ...dto,
                    ...(dto.occurredAt && { occurredAt: new Date(dto.occurredAt) }),
                },
            });

            if (mustRegenerate && updated.installmentsCount > 1) {
                // reutilizamos create() logic simplificada
                await this.create(userId, {
                    creditCardId: updated.creditCardId,
                    categoryId: updated.categoryId ?? undefined,
                    totalAmountCents: updated.totalAmountCents,
                    installmentsCount: updated.installmentsCount,
                    occurredAt: updated.occurredAt.toISOString(),
                    description: updated.description ?? undefined,
                });
            }

            return updated;
        });
    }

    async softDelete(userId: number, purchaseId: number) {
        const purchase = await this.prisma.creditCardPurchase.findUnique({
            where: { id: purchaseId },
        });

        if (!purchase || purchase.isDeleted) {
            throw new NotFoundException('Purchase not found');
        }

        if (purchase.userId !== userId) {
            throw new ForbiddenException();
        }

        if (
            await this.hasBilledInstallments(purchaseId) ||
            await this.hasClosedStatement(purchaseId)
        ) {
            throw new BadRequestException(
                'Cannot modify purchase linked to a closed statement',
            );
        }


        return this.prisma.$transaction(async (tx) => {
            await tx.creditCardInstallment.deleteMany({
                where: { purchaseId },
            });

            return tx.creditCardPurchase.update({
                where: { id: purchaseId },
                data: { isDeleted: true },
            });
        });
    }
}
