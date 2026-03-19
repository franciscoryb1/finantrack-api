import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdjustBalanceDto {
    @IsInt()
    @Min(0)
    newBalanceCents: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    note?: string;

    @IsOptional()
    @IsInt()
    categoryId?: number;
}
