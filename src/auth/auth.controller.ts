import { Controller, Post, Body, UseGuards, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ChatbotApiKeyGuard } from './chatbot-api-key.guard';
import { ResolveChatbotUserDto } from './dto/resolve-chatbot-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.phoneNumber);
  }

  @Post('login')
  login(@Body() dto: RegisterDto) {
    return this.authService.login(dto.email, dto.password);
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
}
