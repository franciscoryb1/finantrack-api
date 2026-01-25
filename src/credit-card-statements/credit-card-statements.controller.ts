import {
    Body,
    Controller,
    Param,
    ParseIntPipe,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditCardStatementsService } from './credit-card-statements.service';
import { CreateStatementDto } from './dto/create-statement.dto';
import { PayStatementDto } from './dto/pay-statement.dto';

@Controller('credit-card-statements')
@UseGuards(JwtAuthGuard)
export class CreditCardStatementsController {
    constructor(private readonly service: CreditCardStatementsService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateStatementDto) {
        return this.service.create(req.user.userId, dto);
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

}
