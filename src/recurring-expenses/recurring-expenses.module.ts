import { Module } from '@nestjs/common';
import { RecurringExpensesService } from './recurring-expenses.service';
import { RecurringExpensesController } from './recurring-expenses.controller';
import { CreditCardPurchasesService } from '../credit-card-purchases/credit-card-purchases.service';

@Module({
    providers: [RecurringExpensesService, CreditCardPurchasesService],
    controllers: [RecurringExpensesController],
})
export class RecurringExpensesModule { }
