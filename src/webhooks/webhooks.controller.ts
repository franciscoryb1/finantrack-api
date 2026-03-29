import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus } from '@prisma/client';
import { IsString, IsIn, IsOptional } from 'class-validator';

class NotificationWebhookDto {
  @IsString()
  jobId: string;

  @IsIn(['SENT', 'FAILED'])
  status: 'SENT' | 'FAILED';

  @IsOptional()
  @IsString()
  error?: string;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private prisma: PrismaService) {}

  @Post('notifications')
  async handleNotificationCallback(
    @Headers('x-webhook-secret') secret: string,
    @Body() dto: NotificationWebhookDto,
  ) {
    if (secret !== process.env.NOTIFICATIONS_WEBHOOK_SECRET) {
      throw new UnauthorizedException();
    }

    const notification = await this.prisma.notification.findFirst({
      where: { jobId: dto.jobId },
    });

    if (!notification) {
      this.logger.warn(`Webhook recibido para jobId desconocido: ${dto.jobId}`);
      return { ok: true };
    }

    const now = new Date();

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: dto.status === 'SENT' ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sentAt: dto.status === 'SENT' ? now : null,
        failedAt: dto.status === 'FAILED' ? now : null,
        error: dto.error ?? null,
      },
    });

    this.logger.log(`Notificación actualizada — id=${notification.id} jobId=${dto.jobId} status=${dto.status}`);

    return { ok: true };
  }
}
