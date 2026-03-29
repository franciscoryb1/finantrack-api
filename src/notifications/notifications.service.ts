import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async sendEmailVerification(userId: number, email: string, firstName: string, verifyUrl: string) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: NotificationType.EMAIL_VERIFICATION,
        status: NotificationStatus.PENDING,
        recipient: email,
      },
    });

    try {
      const res = await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/email-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: email, firstName, verifyUrl, notificationId: notification.id }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json() as { jobId?: string };

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.QUEUED, jobId: data.jobId ?? null },
      });

      this.logger.log(`Email de verificación encolado — userId=${userId} email=${email} notificationId=${notification.id}`);
    } catch (e) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, failedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
      });
      this.logger.error(`Error al enviar email de verificación a ${email}`, e instanceof Error ? e.stack : String(e));
    }
  }

  async sendPasswordReset(userId: number, email: string, resetUrl: string) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: NotificationType.PASSWORD_RESET,
        status: NotificationStatus.PENDING,
        recipient: email,
      },
    });

    try {
      const res = await fetch(`${process.env.NOTIFICATIONS_URL}/notifications/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOTIFICATIONS_API_KEY!,
        },
        body: JSON.stringify({ to: email, resetUrl, notificationId: notification.id }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json() as { jobId?: string };

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.QUEUED, jobId: data.jobId ?? null },
      });

      this.logger.log(`Email de reset de contraseña encolado — userId=${userId} email=${email} notificationId=${notification.id}`);
    } catch (e) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, failedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
      });
      this.logger.error(`Error al enviar email de reset de contraseña a ${email}`, e instanceof Error ? e.stack : String(e));
    }
  }
}
