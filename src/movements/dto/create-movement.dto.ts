import { IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, IsDateString } from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
    @IsInt()
    accountId: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsIn([MovementType.INCOME, MovementType.EXPENSE]) // STATEMENT_PAYMENT, TRANSFER_OUT, TRANSFER_IN are system-only
    type: MovementType;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    tagIds?: number[];

    @IsOptional()
    @IsInt()
    @IsPositive()
    sharedAmountCents?: number;
}
