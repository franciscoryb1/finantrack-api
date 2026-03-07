import { Module } from '@nestjs/common';
import { AccountTransfersController } from './account-transfers.controller';
import { AccountTransfersService } from './account-transfers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [AccountTransfersController],
    providers: [AccountTransfersService],
})
export class AccountTransfersModule { }
