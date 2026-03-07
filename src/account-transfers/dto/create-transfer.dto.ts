import { IsDateString, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateTransferDto {
    @IsInt()
    @Min(1)
    fromAccountId: number;

    @IsInt()
    @Min(1)
    toAccountId: number;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsDateString()
    transferredAt?: string;
}
