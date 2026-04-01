import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { RecurringFrequency } from '@prisma/client';

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
    @IsEnum(RecurringFrequency)
    frequency?: RecurringFrequency;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string | null;
}
