import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CategoriesService } from './categories.service';

/**
 * Endpoint interno consumido por n8n (autenticado por API key) para obtener las
 * categorías EXPENSE de un usuario y poder mapear comercio→categoría antes de
 * ingestar un consumo desde un email.
 */
@Controller('internal/categories')
@UseGuards(ApiKeyGuard)
export class InternalCategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(@Query('userId', ParseIntPipe) userId: number) {
    return this.service.listForIngestion(userId);
  }
}
