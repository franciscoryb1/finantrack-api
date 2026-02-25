import { IsInt, IsOptional, IsString, Min, Max, IsDateString } from 'class-validator';
import { CreditCardBrand } from '@prisma/client';

export class CreateCreditCardDto {
    @IsString()
    name: string;

    @IsOptional()
    brand?: CreditCardBrand;

    @IsInt()
    @Min(1)
    limitCents: number;

    @IsString()
    cardLast4: string;

    @IsDateString()
    cardExpiresAt: string;

    @IsInt()
    bankAccountId: number;
}
