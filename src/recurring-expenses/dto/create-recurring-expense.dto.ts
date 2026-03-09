import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString, Min, Max } from 'class-validator';
import { RecurringFrequency } from '@prisma/client';

export class CreateRecurringExpenseDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsEnum(RecurringFrequency)
    frequency: RecurringFrequency;

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

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsInt()
    categoryId?: number;
}
