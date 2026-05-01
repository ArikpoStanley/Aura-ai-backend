import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AnthropicService } from './services/anthropic.service';
import { CloudinaryService } from './services/cloudinary.service';
import { ReplicateService } from './services/replicate.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AnthropicService, ReplicateService, CloudinaryService],
})
export class AiModule {}
