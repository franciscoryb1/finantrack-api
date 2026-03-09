import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecurringExpensesService } from './recurring-expenses.service';
import { CreateRecurringExpenseDto } from './dto/create-recurring-expense.dto';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto';
import { PayRecurringExpenseDto } from './dto/pay-recurring-expense.dto';
import { GetUpcomingDto } from './dto/get-upcoming.dto';

@Controller('recurring-expenses')
@UseGuards(JwtAuthGuard)
export class RecurringExpensesController {
    constructor(private readonly service: RecurringExpensesService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateRecurringExpenseDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Get()
    list(@Req() req: any) {
        return this.service.list(req.user.userId);
    }

    @Get('upcoming')
    getUpcoming(@Req() req: any, @Query() query: GetUpcomingDto) {
        return this.service.getUpcoming(req.user.userId, query);
    }

    @Patch(':id')
    update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRecurringExpenseDto) {
        return this.service.update(req.user.userId, Number(id), dto);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Req() req: any, @Param('id') id: string) {
        return this.service.remove(req.user.userId, Number(id));
    }

    @Post(':id/pay')
    pay(@Req() req: any, @Param('id') id: string, @Body() dto: PayRecurringExpenseDto) {
        return this.service.pay(req.user.userId, Number(id), dto);
    }
}
