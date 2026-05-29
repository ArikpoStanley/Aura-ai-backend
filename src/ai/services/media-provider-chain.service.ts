import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  VideoGenerationRequest,
  VideoGenerationResult,
} from '../providers/media-generation.provider';
import {
  isOpenAiModerationBlock,
  makeSoraSafeBrollPrompt,
} from '../utils/moderation-safe-prompt';
import { GoogleVeoMediaService } from './google-veo-media.service';
import { OpenAiMediaService } from './openai-media.service';

@Injectable()
export class MediaProviderChainService {
  constructor(
    private readonly config: ConfigService,
    private readonly openAiMedia: OpenAiMediaService,
    private readonly googleVeoMedia: GoogleVeoMediaService,
  ) {}

  hasVideoProvider(): boolean {
    return this.getSelectedProvider() !== null;
  }

  selectedProviderName(): string | null {
    return this.getSelectedProvider()?.name ?? null;
  }

  requiresStrictVideoPromptSafety(): boolean {
    return this.selectedProviderName() === this.openAiMedia.name;
  }

  async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const provider = this.getSelectedProvider();
    if (!provider) {
      throw new Error(
        'No video provider is configured (set VIDEO_MEDIA_PROVIDER=google with GOOGLE_API_KEY, or openai with OPENAI_API_KEY)',
      );
    }
    if (provider !== this.openAiMedia) {
      return provider.generateVideo(request);
    }
    if (!provider.isConfigured()) {
      throw new Error('OpenAI video provider is not configured (set OPENAI_API_KEY)');
    }
    try {
      return await provider.generateVideo(request);
    } catch (err) {
      if (!(err instanceof Error) || !isOpenAiModerationBlock(err.message)) {
        throw err;
      }

      const saferPrompt = makeSoraSafeBrollPrompt(request.prompt);
      if (saferPrompt === request.prompt) {
        throw err;
      }

      return provider.generateVideo({
        ...request,
        prompt: saferPrompt,
        imageUrl: this.isDirectMediaUrl(request.imageUrl)
          ? request.imageUrl
          : undefined,
      });
    }
  }

  private isDirectMediaUrl(url?: string): boolean {
    return Boolean(
      url && /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url),
    );
  }

  private getSelectedProvider():
    | OpenAiMediaService
    | GoogleVeoMediaService
    | null {
    const requested = this.config
      .get<string>('VIDEO_MEDIA_PROVIDER', 'auto')
      .toLowerCase();

    if (requested === 'google' || requested === 'google-veo' || requested === 'veo') {
      return this.googleVeoMedia.isConfigured() ? this.googleVeoMedia : null;
    }
    if (requested === 'openai' || requested === 'sora') {
      return this.openAiMedia.isConfigured() ? this.openAiMedia : null;
    }
    return (
      (this.googleVeoMedia.isConfigured() && this.googleVeoMedia) ||
      (this.openAiMedia.isConfigured() && this.openAiMedia) ||
      null
    );
  }
}
