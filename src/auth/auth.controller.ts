import { Controller, Post, Body, UseGuards, NotFoundException, ForbiddenException, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ChatbotApiKeyGuard } from './chatbot-api-key.guard';
import { ResolveChatbotUserDto } from './dto/resolve-chatbot-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

import { Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
    private usersService: UsersService,
  ) { }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req) {
    const user = await this.usersService.findById(req.user.userId);
    return {
      user: {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const { user, verificationToken } = await this.authService.register(
      dto.email, dto.password, dto.firstName, dto.lastName, dto.phoneNumber,
    );

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

    try {
      await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/email-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: dto.email, firstName: dto.firstName, verifyUrl }),
      });
    } catch (e) {
      console.error('[Auth] Error al contactar notifications service:', e);
    }

    return user;
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    if (!token) throw new UnauthorizedException('Token requerido');
    await this.usersService.verifyEmailByToken(token);
    return { message: 'Email verificado correctamente.' };
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  async resendVerification(@Req() req) {
    const token = await this.authService.resendVerificationEmail(req.user.userId);
    if (!token) return { message: 'El email ya está verificado.' };

    const user = await this.usersService.findById(req.user.userId);
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

    try {
      await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/email-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: user.email, firstName: user.firstName, verifyUrl }),
      });
    } catch (e) {
      console.error('[Auth] Error al contactar notifications service:', e);
    }

    return { message: 'Email de verificación reenviado.' };
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

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const token = await this.authService.forgotPassword(dto.email);

    if (!token) throw new NotFoundException('No existe una cuenta asociada a ese email.');

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

    try {
      await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: dto.email, resetUrl }),
      });
    } catch (e) {
      console.error('[Auth] Error al contactar notifications service:', e);
    }

    return { message: 'Si el email existe, recibirás un enlace.' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Contraseña actualizada correctamente.' };
  }
}
