import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { WorkerAppModule } from './worker-app.module';
import { VideoStudioGenerationService } from './video-studio/video-studio-generation.service';
import {
  VIDEO_GENERATION_QUEUE,
  VideoGenerationJobPayload,
} from './queue/video-generation.constants';

async function bootstrap() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to run the video generation worker');
  }

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const generationService = app.get(VideoStudioGenerationService);
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.VIDEO_WORKER_CONCURRENCY ?? '1', 10) || 1,
  );

  const worker = new Worker<VideoGenerationJobPayload>(
    VIDEO_GENERATION_QUEUE,
    async (job) => {
      const result = await generationService.executeProjectGeneration(
        job.data.projectId,
        job.data.userId,
      );
      if (!result.ok && result.retryable) {
        throw new Error(result.reason ?? 'Retryable video generation failure');
      }
      if (!result.ok) {
        Logger.warn(
          `Project ${job.data.projectId} failed without retry: ${result.reason ?? 'unknown reason'}`,
          'VideoWorker',
        );
      }
    },
    { connection, concurrency },
  );

  worker.on('completed', (job) => {
    Logger.log(`Job ${job.id} completed`, 'VideoWorker');
  });
  worker.on('failed', (job, err) => {
    Logger.error(`Job ${job?.id} failed: ${err.message}`, 'VideoWorker');
  });

  Logger.log(
    `Video generation worker started with concurrency ${concurrency}`,
    'VideoWorker',
  );

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();
