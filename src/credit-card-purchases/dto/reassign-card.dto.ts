import { IsInt, IsPositive, IsOptional, IsDateString } from 'class-validator';

export class ReassignCardDto {
    @IsInt()
    @IsPositive()
    creditCardId: number;

    @IsOptional()
    @IsDateString()
    occurredAt?: string;
}
