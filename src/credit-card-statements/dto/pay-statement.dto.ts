import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PayStatementDto {
    @IsInt()
    @Min(1)
    accountId: number;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    paidAt?: string;
}
