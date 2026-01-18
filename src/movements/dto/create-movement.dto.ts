import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsDateString } from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
    @IsInt()
    accountId: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsEnum(MovementType)
    type: MovementType;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;
}
