import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ImportLegacyPurchaseDto } from './dto/import-legacy-purchase.dto';

@Controller('credit-card-purchases')
@UseGuards(JwtAuthGuard)
export class CreditCardPurchasesController {
    constructor(private readonly service: CreditCardPurchasesService) { }

    @Get('card/:cardId')
    listByCard(
        @Req() req: any,
        @Param('cardId', ParseIntPipe) cardId: number,
    ) {
        return this.service.listByCard(req.user.userId, cardId);
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreatePurchaseDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Post('legacy-import')
    importLegacy(@Req() req: any, @Body() dto: ImportLegacyPurchaseDto) {
        return this.service.importLegacy(req.user.userId, dto);
    }

    @Patch(':id')
    update(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePurchaseDto,
    ) {
        return this.service.update(req.user.userId, id, dto);
    }

    @Delete(':id')
    remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.softDelete(req.user.userId, id);
    }
}
