import { IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

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

    // Reintegro promocional (opcional, null para eliminar)
    @IsOptional()
    @IsInt()
    @IsPositive()
    reimbursementAmountCents?: number | null;

    @IsOptional()
    @IsInt()
    reimbursementAccountId?: number | null;

    @IsOptional()
    @IsDateString()
    reimbursementAt?: string | null;

    // Gasto compartido (opcional, null para eliminar)
    @IsOptional()
    @IsInt()
    @IsPositive()
    sharedAmountCents?: number | null;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    tagIds?: number[];
}
