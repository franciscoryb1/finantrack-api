import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountTransfersService } from './account-transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('account-transfers')
@UseGuards(JwtAuthGuard)
export class AccountTransfersController {
    constructor(private readonly service: AccountTransfersService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateTransferDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Get()
    list(@Req() req: any) {
        return this.service.listByUser(req.user.userId);
    }
}
