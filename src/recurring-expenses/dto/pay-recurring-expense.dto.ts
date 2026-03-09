import { IsDateString, IsInt, IsPositive } from 'class-validator';

export class PayRecurringExpenseDto {
    @IsDateString()
    dueDate: string;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsInt()
    accountId: number;
}
