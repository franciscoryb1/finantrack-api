import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsDateString } from 'class-validator';
import { MovementType } from '@prisma/client';

export class UpdateMovementDto {
    @IsOptional()
    @IsInt()
    accountId?: number;

    @IsOptional()
    @IsInt()
    categoryId?: number | null; // permitir “desasignar” categoría

    @IsOptional()
    @IsEnum(MovementType)
    type?: MovementType;

    @IsOptional()
    @IsInt()
    @IsPositive()
    amountCents?: number;

    @IsOptional()
    @IsDateString()
    occurredAt?: string;

    @IsOptional()
    @IsString()
    description?: string | null;
}
