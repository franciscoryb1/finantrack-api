import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { GetDashboardActivityDto } from './dto/get-dashboard-activity.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private readonly service: DashboardService) { }

    @Get('activity')
    getActivity(@Req() req: any, @Query() query: GetDashboardActivityDto) {
        return this.service.getActivity(req.user.userId, query.year, query.month);
    }
}
