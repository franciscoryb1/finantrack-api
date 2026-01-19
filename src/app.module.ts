import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { MovementsModule } from './movements/movements.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [PrismaModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    MovementsModule,
    CategoriesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
