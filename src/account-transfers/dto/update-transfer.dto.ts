import { IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateTransferDto {
    @IsOptional()
    @IsInt()
    @IsPositive()
    amountCents?: number;

    @IsOptional()
    @IsDateString()
    transferredAt?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    tagIds?: number[];
}
