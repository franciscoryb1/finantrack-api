import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstallmentsController } from './credit-card-installments.controller';
import { InstallmentsService } from './credit-card-installments.service';

@Module({
    imports: [PrismaModule],
    controllers: [InstallmentsController],
    providers: [InstallmentsService],
})
export class InstallmentsModule { }