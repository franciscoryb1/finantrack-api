import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Cookies
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: [
      'http://localhost:3001', // frontend local
      // agregar aquí tu frontend en producción cuando lo tengas
      // 'https://finantrack-frontend.onrender.com'
    ],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Finantrack API running on port ${port}`);
}

bootstrap();