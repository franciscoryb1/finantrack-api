import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // Solo loggear errores inesperados (500s)
    if (status >= 500) {
      this.logger.error(
        `[${req.method}] ${req.url} → ${status} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message },
    );
  }
}
