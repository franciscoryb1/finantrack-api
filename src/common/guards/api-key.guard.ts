import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Protege endpoints internos (ej. ingesta desde n8n) con una API key compartida.
 * La key esperada se lee de `INTERNAL_API_KEY` y se compara con el header `x-api-key`
 * usando comparación timing-safe para evitar ataques de temporización.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_KEY;

    if (!expected) {
      this.logger.error(
        'INTERNAL_API_KEY no está configurada — rechazando request interno',
      );
      throw new InternalServerErrorException();
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const provided = request.headers['x-api-key'];

    if (typeof provided !== 'string' || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
