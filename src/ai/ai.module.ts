import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CloudinaryService } from './services/cloudinary.service';
import { FfmpegRendererService } from './services/ffmpeg-renderer.service';
import { HybridVideoPipelineService } from './services/hybrid-video-pipeline.service';
import { MediaProviderChainService } from './services/media-provider-chain.service';
import { OpenAiMediaService } from './services/openai-media.service';
import { OpenAiService } from './services/openai.service';
import { OpenAiTtsService } from './services/openai-tts.service';
import { ReplicateModelRouterService } from './services/replicate-model-router.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    OpenAiService,
    OpenAiMediaService,
    OpenAiTtsService,
    ReplicateModelRouterService,
    MediaProviderChainService,
    FfmpegRendererService,
    HybridVideoPipelineService,
    CloudinaryService,
  ],
  exports: [AiService, HybridVideoPipelineService],
})
export class AiModule {}
