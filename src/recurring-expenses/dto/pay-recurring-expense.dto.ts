import { IsDateString, IsInt, IsOptional, IsPositive, Min } from 'class-validator';

export class PayRecurringExpenseDto {
    @IsDateString()
    dueDate: string;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsInt()
    accountId?: number;

    @IsOptional()
    @IsInt()
    creditCardId?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    installmentsCount?: number;
}
