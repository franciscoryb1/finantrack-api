import { Controller, Post, Body, UseGuards, NotFoundException, ForbiddenException, Get, Query, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AuthController.name);

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

    this.logger.log(`Usuario registrado — id=${user.id} email=${dto.email}`);

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

    try {
      await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/email-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: dto.email, firstName: dto.firstName ?? '', verifyUrl }),
      });
      this.logger.log(`Email de verificación enviado — id=${user.id} email=${dto.email}`);
    } catch (e) {
      this.logger.error(`Error al enviar email de verificación a ${dto.email}`, e instanceof Error ? e.stack : String(e));
    }

    return user;
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    if (!token) throw new UnauthorizedException('Token requerido');
    const user = await this.usersService.verifyEmailByToken(token);
    this.logger.log(`Email verificado — id=${user.id} email=${user.email}`);
    return { message: 'Email verificado correctamente.' };
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  async resendVerification(@Req() req) {
    const token = await this.authService.resendVerificationEmail(req.user.userId);
    if (!token) return { message: 'El email ya está verificado.' };

    const user = await this.usersService.findById(req.user.userId);
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

    const notifUrl = `${process.env.NOTIFICATIONS_URL}/notifications/email-verification`;

    try {
      const notifRes = await fetch(notifUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: user.email, firstName: user.firstName ?? '', verifyUrl }),
      });
      if (!notifRes.ok) {
        const body = await notifRes.text();
        this.logger.error(`Error al reenviar email de verificación a ${user.email} — HTTP ${notifRes.status}: ${body}`);
      } else {
        this.logger.log(`Email de verificación reenviado — id=${user.id} email=${user.email}`);
      }
    } catch (e) {
      this.logger.error(`Error al contactar notifications service (reenvío verificación) para ${user.email}`, e instanceof Error ? e.stack : String(e));
    }

    return { message: 'Email de verificación reenviado.' };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    let tokens: { access_token: string; refresh_token: string };

    try {
      tokens = await this.authService.login(dto.email, dto.password);
    } catch (e) {
      this.logger.warn(`Login fallido — email=${dto.email}`);
      throw e;
    }

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    });

    res.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    });

    this.logger.log(`Login exitoso — email=${dto.email}`);

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

    this.logger.log(`Token renovado — id=${decoded.sub}`);

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    });

    res.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    });

    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.userId);

    this.logger.log(`Logout — id=${req.user.userId}`);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return { message: 'Logged out' };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const token = await this.authService.forgotPassword(dto.email);

    if (!token) throw new NotFoundException('No existe una cuenta asociada a ese email.');

    this.logger.log(`Reset de contraseña solicitado — email=${dto.email}`);

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
      this.logger.log(`Email de reset de contraseña enviado — email=${dto.email}`);
    } catch (e) {
      this.logger.error(`Error al enviar email de reset de contraseña a ${dto.email}`, e instanceof Error ? e.stack : String(e));
    }

    return { message: 'Si el email existe, recibirás un enlace.' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    this.logger.log(`Contraseña reseteada exitosamente`);
    return { message: 'Contraseña actualizada correctamente.' };
  }
}
