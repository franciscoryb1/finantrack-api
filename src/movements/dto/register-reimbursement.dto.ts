import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class RegisterReimbursementDto {
    @IsInt()
    accountId: number;

    @IsInt()
    @IsPositive()
    amountCents: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;
}
