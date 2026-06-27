import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  IsIn,
  Min,
} from 'class-validator';
import { ParserConfidence } from '@prisma/client';

/**
 * Payload que envía n8n al detectar un consumo de tarjeta en un email bancario.
 * El backend es agnóstico al origen: sólo valida y persiste como draft pendiente.
 */
export class CreateFromEmailDto {
  /** Usuario dueño del consumo (n8n lo conoce por configuración). */
  @IsInt()
  userId: number;

  /** ID único del email de Gmail, usado para deduplicar. */
  @IsString()
  emailMessageId: string;

  /**
   * Últimos 4 dígitos de la tarjeta, para resolver la CreditCard.
   * Opcional: si el email no los trae, el consumo queda sin tarjeta y se
   * asigna al confirmar.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  cardLast4?: string;

  @IsInt()
  @IsPositive()
  totalAmountCents: number;

  /**
   * Cantidad de cuotas detectada (ej. "en 3 cuotas"). Opcional: si no viene,
   * se asume 1 pago y se puede corregir al confirmar.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  installmentsCount?: number;

  @IsDateString()
  occurredAt: string;

  /** Nombre del comercio detectado. */
  @IsString()
  description: string;

  /**
   * Categoría sugerida por n8n (mapea nombre→id vía GET /internal/categories).
   * Si es inválida para el usuario, el backend la ignora y guarda sin categoría.
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  categoryId?: number;

  /** Banco emisor (informativo; se conserva en rawEmailData). */
  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsIn([ParserConfidence.HIGH, ParserConfidence.MEDIUM, ParserConfidence.LOW])
  parserConfidence?: ParserConfidence;

  /** Payload crudo del parser, para auditoría. */
  @IsOptional()
  @IsObject()
  rawEmailData?: Record<string, unknown>;
}
