import { IsDateString, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UpdatePurchaseDto {
    @IsOptional()
    @IsInt()
    categoryId?: number | null;

    @IsOptional()
    @IsInt()
    @IsPositive()
    totalAmountCents?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    installmentsCount?: number;

    @IsOptional()
    @IsDateString()
    occurredAt?: string;

    @IsOptional()
    @IsString()
    description?: string | null;
}
