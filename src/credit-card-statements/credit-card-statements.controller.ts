import {
    Body,
    Controller,
    Delete,
    Param,
    ParseIntPipe,
    Post,
    Patch,
    Req,
    UseGuards,
    Get,
    HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditCardStatementsService } from './credit-card-statements.service';
import { CreateStatementDto } from './dto/create-statement.dto';
import { PayStatementDto } from './dto/pay-statement.dto';
import { UpdateStatementDatesDto } from './dto/update-statement-dates.dto';
import { StatementExtraDto } from './dto/statement-extra.dto';

@Controller('credit-card-statements')
@UseGuards(JwtAuthGuard)
export class CreditCardStatementsController {
    constructor(private readonly service: CreditCardStatementsService) { }

    @Get('card/:cardId')
    listByCard(
        @Req() req: any,
        @Param('cardId', ParseIntPipe) cardId: number,
    ) {
        return this.service.listByCard(req.user.userId, cardId);
    }

    @Get(':id')
    getDetail(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.getDetail(req.user.userId, id);
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreateStatementDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Patch(':id/dates')
    updateDates(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateStatementDatesDto,
    ) {
        return this.service.updateDates(req.user.userId, id, dto);
    }

    @Post(':id/close')
    close(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.close(req.user.userId, id);
    }

    @Post(':id/pay')
    pay(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: PayStatementDto,
    ) {
        return this.service.pay(req.user.userId, id, dto);
    }

    @Post(':id/extras')
    addExtra(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: StatementExtraDto,
    ) {
        return this.service.addExtra(req.user.userId, id, dto);
    }

    @Delete(':id/extras/:extraId')
    @HttpCode(204)
    removeExtra(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Param('extraId', ParseIntPipe) extraId: number,
    ) {
        return this.service.removeExtra(req.user.userId, id, extraId);
    }

}
