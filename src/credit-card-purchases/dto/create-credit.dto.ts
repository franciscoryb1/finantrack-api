import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateCreditCardCreditDto {
    @IsInt()
    creditCardId: number;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsInt()
    categoryId?: number;
}
