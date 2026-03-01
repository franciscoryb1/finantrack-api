import {
    IsDateString,
    IsInt,
    IsOptional,
    IsPositive,
    IsString,
    Max,
    Min,
} from 'class-validator';


export class ImportLegacyPurchaseDto {
    @IsInt()
    creditCardId: number;

    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsInt()
    @IsPositive()
    totalAmountCents: number;

    @IsInt()
    @Min(2)
    installmentsCount: number;

    /** Cuántas cuotas ya fueron pagadas (0 = ninguna pagada aún) */
    @IsInt()
    @Min(0)
    paidInstallmentsCount: number;

    @IsDateString()
    occurredAt: string;

    @IsOptional()
    @IsString()
    description?: string;

    /** Año del resumen donde cae la primera cuota */
    @IsInt()
    @Min(2000)
    @Max(2100)
    firstStatementYear: number;

    /** Mes (1-12) del resumen donde cae la primera cuota */
    @IsInt()
    @Min(1)
    @Max(12)
    firstStatementMonth: number;

}
