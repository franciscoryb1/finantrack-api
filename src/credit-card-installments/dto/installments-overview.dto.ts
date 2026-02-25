import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    IsNumber,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InstallmentsOverviewStatementDto {
    @IsInt()
    id: number;

    @IsInt()
    sequenceNumber: number;

    @IsInt()
    year: number;

    @IsInt()
    month: number;

    @IsString()
    closingDate: string;

    @IsString()
    dueDate: string;
}

export class InstallmentsOverviewCardDto {
    @IsInt()
    cardId: number;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    brand: string | null;

    @IsInt()
    limitCents: number;

    @IsInt()
    committedCents: number;

    @IsInt()
    availableCents: number;

    @IsInt()
    openStatementAccumulatedCents: number;

    @IsInt()
    activeInstallmentsCount: number;

    @IsOptional()
    @ValidateNested()
    @Type(() => InstallmentsOverviewStatementDto)
    openStatement: InstallmentsOverviewStatementDto | null;
}

export class InstallmentsOverviewResponseDto {
    @IsInt()
    totalDebtCents: number;

    @IsInt()
    totalNextStatementCents: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InstallmentsOverviewCardDto)
    cards: InstallmentsOverviewCardDto[];
}