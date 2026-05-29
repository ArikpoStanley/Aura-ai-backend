import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  VIDEO_GENERATION_QUEUE,
  VideoGenerationJobPayload,
} from './video-generation.constants';

@Injectable()
export class VideoGenerationQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(VideoGenerationQueueService.name);
  private readonly connection: IORedis | null;
  private readonly queue: Queue<VideoGenerationJobPayload> | null;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.connection = null;
      this.queue = null;
      this.logger.warn(
        'REDIS_URL not set — video jobs run in-process (not durable)',
      );
      return;
    }
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const attempts = Math.max(
      1,
      Number.parseInt(
        this.config.get<string>('VIDEO_QUEUE_ATTEMPTS', '3'),
        10,
      ) || 3,
    );
    const backoffDelay = Math.max(
      1000,
      Number.parseInt(
        this.config.get<string>('VIDEO_QUEUE_BACKOFF_MS', '60000'),
        10,
      ) || 60000,
    );
    this.queue = new Queue<VideoGenerationJobPayload>(VIDEO_GENERATION_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts,
        backoff: { type: 'exponential', delay: backoffDelay },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }

  isQueueEnabled(): boolean {
    return this.queue !== null;
  }

  async enqueue(payload: VideoGenerationJobPayload): Promise<void> {
    if (!this.queue) {
      return;
    }
    await this.queue.add('generate', payload, {
      jobId: `project-${payload.projectId}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
