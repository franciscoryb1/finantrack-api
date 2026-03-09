import { IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class UpdateRecurringExpenseDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsInt()
    @IsPositive()
    amountCents?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    dueDay?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(6)
    dueDayOfWeek?: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;
}
