import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiService } from './services/openai.service';
import { CloudinaryService } from './services/cloudinary.service';
import { ReplicateModelRouterService } from './services/replicate-model-router.service';
import { ReplicateService } from './services/replicate.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    OpenAiService,
    ReplicateService,
    ReplicateModelRouterService,
    CloudinaryService,
  ],
  exports: [AiService],
})
export class AiModule {}
