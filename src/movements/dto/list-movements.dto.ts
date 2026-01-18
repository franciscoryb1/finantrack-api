import { IsEnum, IsInt, IsOptional, IsDateString, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

export class ListMovementsDto {
    @IsOptional()
    @IsInt()
    accountId?: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsOptional()
    @IsEnum(MovementType)
    type?: MovementType;

    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @IsOptional()
    @IsDateString()
    toDate?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    pageSize?: number;
}
