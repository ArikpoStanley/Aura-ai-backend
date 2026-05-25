import { Global, Module } from '@nestjs/common';
import { VideoGenerationQueueService } from './video-generation-queue.service';

@Global()
@Module({
  providers: [VideoGenerationQueueService],
  exports: [VideoGenerationQueueService],
})
export class QueueModule {}
