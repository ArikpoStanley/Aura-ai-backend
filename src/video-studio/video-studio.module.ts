import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VideoProject,
  VideoProjectSchema,
} from './schemas/video-project.schema';
import { VideoStudioController } from './video-studio.controller';
import { VideoStudioService } from './video-studio.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoProject.name, schema: VideoProjectSchema },
    ]),
  ],
  controllers: [VideoStudioController],
  providers: [VideoStudioService],
})
export class VideoStudioModule {}
