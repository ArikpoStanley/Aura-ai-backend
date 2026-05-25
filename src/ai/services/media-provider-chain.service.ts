import { Injectable } from '@nestjs/common';
import type {
  VideoGenerationRequest,
  VideoGenerationResult,
} from '../providers/media-generation.provider';
import { OpenAiMediaService } from './openai-media.service';

@Injectable()
export class MediaProviderChainService {
  constructor(private readonly openAiMedia: OpenAiMediaService) {}

  hasVideoProvider(): boolean {
    return this.openAiMedia.isConfigured();
  }

  async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    if (!this.openAiMedia.isConfigured()) {
      throw new Error('No video provider is configured (set OPENAI_API_KEY)');
    }
    return this.openAiMedia.generateVideo(request);
  }
}
