import {
    Body,
    Controller,
    Get,
    Patch,
    Post,
    Param,
    ParseIntPipe,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditCardsService } from './credit-cards.service';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';

@Controller('credit-cards')
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
    constructor(private readonly service: CreditCardsService) { }

    @Get()
    list(@Req() req: any) {
        return this.service.list(req.user.userId);
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreateCreditCardDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Patch(':id')
    update(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCreditCardDto,
    ) {
        return this.service.update(req.user.userId, id, dto);
    }

    @Patch(':id/deactivate')
    deactivate(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.setActive(req.user.userId, id, false);
    }

    @Patch(':id/activate')
    activate(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.setActive(req.user.userId, id, true);
    }

    @Get(':id/summary')
    getSummary(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.getSummary(req.user.userId, id);
    }
}
