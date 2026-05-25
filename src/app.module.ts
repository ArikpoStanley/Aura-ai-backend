import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { StudioModule } from './studio/studio.module';
import { QueueModule } from './queue/queue.module';
import { VideoStudioModule } from './video-studio/video-studio.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().default(3000),
        MONGODB_URI: Joi.string().required(),
        MONGODB_MAX_POOL_SIZE: Joi.number().integer().min(5).default(30),
        MONGODB_MIN_POOL_SIZE: Joi.number().integer().min(0).default(5),
        JWT_SECRET: Joi.string().min(16).required(),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        OTP_EXPIRES_MINUTES: Joi.number().integer().min(1).default(10),
        THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
        THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
      }).unknown(true),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 120),
        },
      ],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        maxPoolSize: config.get<number>('MONGODB_MAX_POOL_SIZE', 30),
        minPoolSize: config.get<number>('MONGODB_MIN_POOL_SIZE', 5),
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
      inject: [ConfigService],
    }),
    QueueModule,
    AiModule,
    AuthModule,
    VideoStudioModule,
    StudioModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
