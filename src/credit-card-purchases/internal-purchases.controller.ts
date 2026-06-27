import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { CreateFromEmailDto } from './dto/create-from-email.dto';

/**
 * Endpoints internos consumidos por orquestadores externos (n8n).
 * Autenticados por API key (header `x-api-key`), NO por JWT.
 */
@Controller('internal/credit-card-purchases')
@UseGuards(ApiKeyGuard)
export class InternalPurchasesController {
  constructor(private readonly service: CreditCardPurchasesService) {}

  @Post('from-email')
  createFromEmail(@Body() dto: CreateFromEmailDto) {
    return this.service.createFromEmail(dto);
  }
}
