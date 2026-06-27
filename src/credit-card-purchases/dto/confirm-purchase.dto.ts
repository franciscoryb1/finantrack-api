import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

/**
 * Ediciones opcionales al confirmar un consumo pendiente (ingresado por email).
 * Todo es opcional: lo no enviado se toma del draft. La tarjeta es obligatoria
 * para confirmar (puede venir acá o ya estar resuelta en el draft).
 */
export class ConfirmPurchaseDto {
  @IsOptional()
  @IsInt()
  creditCardId?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  totalAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  installmentsCount?: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
