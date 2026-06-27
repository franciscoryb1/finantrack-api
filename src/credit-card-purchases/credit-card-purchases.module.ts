import { Module } from '@nestjs/common';
import { CreditCardPurchasesController } from './credit-card-purchases.controller';
import { InternalPurchasesController } from './internal-purchases.controller';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CreditCardPurchasesController, InternalPurchasesController],
  providers: [CreditCardPurchasesService, PrismaService],
})
export class CreditCardPurchasesModule {}
