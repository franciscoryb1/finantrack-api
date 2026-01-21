import { IsDateString, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreatePurchaseDto {
    @IsInt()
    creditCardId: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsInt()
    @IsPositive()
    totalAmountCents: number;

    @IsInt()
    @Min(1)
    installmentsCount: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;
}
