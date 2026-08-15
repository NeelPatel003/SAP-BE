import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Faster cold start on Render free instances
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : undefined,
  });
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';
  const enableSwagger =
    nodeEnv !== 'production' || config.get<string>('ENABLE_SWAGGER') === 'true';

  if (nodeEnv === 'production') {
    const access = config.get<string>('JWT_ACCESS_SECRET') || '';
    const refresh = config.get<string>('JWT_REFRESH_SECRET') || '';
    if (access.length < 32 || refresh.length < 32) {
      throw new Error(
        'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be at least 32 characters in production',
      );
    }
    const cors = config.get<string>('CORS_ORIGINS') || '';
    if (!cors.trim() || cors.includes('*')) {
      throw new Error(
        'CORS_ORIGINS must list explicit frontend origin(s) in production (no *)',
      );
    }
  }

  app.use(
    helmet({
      // API consumed by browser SPA on another origin (localhost:3000)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  const origins = (config.get<string>('CORS_ORIGINS') || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (enableSwagger) {
    const swagger = new DocumentBuilder()
      .setTitle('Teamora API')
      .setDescription('Platform auth, RBAC, companies, admin monitoring')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT') || 4000;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  if (enableSwagger) {
    console.log(`Swagger docs at http://localhost:${port}/docs`);
  }
}

bootstrap();
