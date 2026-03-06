import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    getMe(@Req() req: any) {
        return this.usersService.getProfile(req.user.userId);
    }

    @Patch('me')
    updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
        return this.usersService.updateProfile(req.user.userId, dto);
    }

    @Patch('me/password')
    changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
        return this.usersService.changePassword(req.user.userId, dto);
    }
}
