import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstallmentsService } from './credit-card-installments.service';
import { InstallmentsOverviewResponseDto } from './dto/installments-overview.dto';

@Controller('installments')
@UseGuards(JwtAuthGuard)
export class InstallmentsController {
    constructor(private readonly service: InstallmentsService) { }

    @Get('overview')
    overview(@Req() req: any): Promise<InstallmentsOverviewResponseDto> {
        return this.service.getOverview(req.user.userId);
    }
}