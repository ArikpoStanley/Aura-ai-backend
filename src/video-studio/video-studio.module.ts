import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { QueueModule } from '../queue/queue.module';
import {
  VideoProject,
  VideoProjectSchema,
} from './schemas/video-project.schema';
import { VideoStudioController } from './video-studio.controller';
import { VideoStudioGenerationService } from './video-studio-generation.service';
import { VideoStudioService } from './video-studio.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoProject.name, schema: VideoProjectSchema },
    ]),
    QueueModule,
    AiModule,
  ],
  controllers: [VideoStudioController],
  providers: [VideoStudioService, VideoStudioGenerationService],
})
export class VideoStudioModule {}
