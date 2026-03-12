import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountTransfersService } from './account-transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';

@Controller('account-transfers')
@UseGuards(JwtAuthGuard)
export class AccountTransfersController {
    constructor(private readonly service: AccountTransfersService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateTransferDto) {
        return this.service.create(req.user.userId, dto);
    }

    @Patch(':id')
    update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTransferDto) {
        return this.service.update(req.user.userId, id, dto);
    }

    @Get()
    list(@Req() req: any) {
        return this.service.listByUser(req.user.userId);
    }
}
