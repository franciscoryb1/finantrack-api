import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { GetMovementsSummaryDto } from './dto/get-movements-summary.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';

@Controller('movements')
@UseGuards(JwtAuthGuard)
export class MovementsController {
    constructor(private readonly service: MovementsService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateMovementDto) {
        return this.service.createMovement(req.user.userId, dto);
    }

    @Get()
    list(@Req() req: any, @Query() query: ListMovementsDto) {
        return this.service.listMovements(req.user.userId, query);
    }

    @Get('summary')
    getSummary(@Req() req: any, @Query() query: GetMovementsSummaryDto) {
        return this.service.getMovementsSummary(req.user.userId, query);
    }

    @Get(':id')
    getById(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.getMovementById(req.user.userId, id);
    }

    @Patch(':id')
    update(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateMovementDto,
    ) {
        return this.service.updateMovement(req.user.userId, id, dto);
    }

    @Delete(':id')
    softDelete(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.softDeleteMovement(req.user.userId, id);
    }
}
