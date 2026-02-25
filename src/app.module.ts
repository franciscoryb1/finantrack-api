import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { MovementsModule } from './movements/movements.module';
import { CategoriesModule } from './categories/categories.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { CreditCardPurchasesModule } from './credit-card-purchases/credit-card-purchases.module';
import { CreditCardStatementsModule } from './credit-card-statements/credit-card-statements.module';
import { ConfigModule } from '@nestjs/config';
import { InstallmentsModule } from './credit-card-installments/credit-card-installments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    MovementsModule,
    CategoriesModule,
    CreditCardsModule,
    CreditCardPurchasesModule,
    CreditCardStatementsModule,
    InstallmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
