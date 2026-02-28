import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class GetMovementsSummaryDto {
    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @IsOptional()
    @IsDateString()
    toDate?: string;

    @IsOptional()
    @IsInt()
    accountId?: number;
}
