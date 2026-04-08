import { IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

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

    // Reintegro promocional (opcional)
    @IsOptional()
    @IsInt()
    @IsPositive()
    reimbursementAmountCents?: number;

    @IsOptional()
    @IsInt()
    reimbursementAccountId?: number;

    @IsOptional()
    @IsDateString()
    reimbursementAt?: string;

    // Gasto compartido (opcional)
    @IsOptional()
    @IsInt()
    @IsPositive()
    sharedAmountCents?: number;

    @IsOptional()
    @IsInt()
    sharedReimbursementAccountId?: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    tagIds?: number[];
}
