import { Controller, Post, Body, UseGuards, NotFoundException, ForbiddenException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ChatbotApiKeyGuard } from './chatbot-api-key.guard';
import { ResolveChatbotUserDto } from './dto/resolve-chatbot-user.dto';

import { Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) { }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req) {
    return {
      user: req.user,
    };
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.phoneNumber);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto.email, dto.password);

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });

    res.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });

    return tokens;
  }

  @Post('chatbot/resolve-user')
  @UseGuards(ChatbotApiKeyGuard)
  async resolveChatbotUser(@Body() dto: ResolveChatbotUserDto) {
    const user = await this.authService.findUserByPhone(dto.phoneNumber);

    if (!user) {
      throw new NotFoundException('User not found for this phone number');
    }

    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    return {
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
      },
    };
  }


  @Post('refresh')
  async refresh(@Req() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken =
      req.cookies?.refresh_token || req.body?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    let decoded: any;

    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException();
    }

    const tokens = await this.authService.refreshTokens(
      decoded.sub,
      refreshToken,
    );

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: 'lax',
    });

    res.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
    });

    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.userId);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return { message: 'Logged out' };
  }
}
