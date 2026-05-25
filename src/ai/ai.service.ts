import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GeneratePromptDto } from './dto/generate-prompt.dto';
import { RemixVideoDto } from './dto/remix-video.dto';
import { OpenAiService } from './services/openai.service';
import { CloudinaryService } from './services/cloudinary.service';
import { ReplicateModelRouterService } from './services/replicate-model-router.service';
import { HybridVideoPipelineService } from './services/hybrid-video-pipeline.service';
import { MediaProviderChainService } from './services/media-provider-chain.service';
import { OpenAiMediaService } from './services/openai-media.service';
import { FfmpegRendererService } from './services/ffmpeg-renderer.service';
import { OpenAiTtsService } from './services/openai-tts.service';
import {
  applyEnglishImagePrompt,
  isEnglishLanguage,
} from './constants/generation-language';
import type { VideoLengthTier } from './constants/replicate-use-case';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly openAiService: OpenAiService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly modelRouter: ReplicateModelRouterService,
    private readonly hybridPipeline: HybridVideoPipelineService,
    private readonly mediaChain: MediaProviderChainService,
    private readonly openAiMedia: OpenAiMediaService,
    private readonly ffmpegRenderer: FfmpegRendererService,
    private readonly openAiTts: OpenAiTtsService,
  ) {}

  async generatePrompt(dto: GeneratePromptDto) {
    const prompt = await this.openAiService.generateVideoPrompt(dto);
    return { prompt };
  }

  async generateImage(userId: string, dto: GenerateImageDto) {
    const rawPrompt = [
      dto.prompt,
      dto.style ? `style: ${dto.style}` : null,
      dto.aspectRatio ? `aspect ratio: ${dto.aspectRatio}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const prompt = isEnglishLanguage(
      this.config.get<string>('GENERATION_DEFAULT_LANGUAGE'),
    )
      ? applyEnglishImagePrompt(rawPrompt)
      : rawPrompt;

    const image = await this.openAiMedia.generateStudioImage(userId, prompt, {
      folder: 'auravid/generated-images',
        aspectRatio: dto.aspectRatio,
      negativePrompt: dto.negativePrompt,
    });
    return {
      predictionId: null,
      model: image.model,
      outputs: image.outputs,
      cloudinary: image.cloudinary,
    };
  }

  async generateCharacter(userId: string, dto: GenerateCharacterDto) {
    const characterPrompt =
      await this.openAiService.generateCharacterPrompt(dto);
    const image = await this.openAiMedia.generateStudioImage(
      userId,
      characterPrompt,
      {
        folder: 'auravid/generated-characters',
        aspectRatio: '1:1',
      },
    );
    return {
      prompt: characterPrompt,
      predictionId: null,
      model: image.model,
      outputs: image.outputs,
      cloudinary: image.cloudinary,
    };
  }

  async remixVideo(userId: string, dto: RemixVideoDto) {
    await this.openAiService.generateVideoPrompt({
      idea: `Remix this source video: ${dto.sourceVideoUrl}. Instruction: ${dto.instruction}`,
      style: 'video remix',
      tone: 'creative but faithful to source intent',
    });
    throw new BadGatewayException(
      'Video remix is disabled in OpenAI-only mode. Use text-to-video or photos-script generation instead.',
    );
  }

  async studioTextToVideo(
    userId: string,
    args: {
      prompt: string;
      voiceStyle: string;
      visualStyle: string;
      videoLength?: VideoLengthTier;
      onProgress?: (progress: number) => void | Promise<void>;
    },
  ) {
    const enriched = await this.openAiService.generateVideoPrompt({
      idea: args.prompt,
      tone: args.voiceStyle.replaceAll('_', ' '),
      style: args.visualStyle.replaceAll('_', ' '),
      targetAudience: 'general',
    });
    return this.runAiVideoPipeline(userId, {
      basePrompt: enriched,
      videoLength: args.videoLength,
      folder: 'auravid/creation/text-to-video',
      aspectRatio: '16:9',
      onProgress: args.onProgress,
    });
  }

  async studioFacelessVideo(
    userId: string,
    args: {
      topic: string;
      niche: string;
      aspectRatio: string;
      videoLength?: VideoLengthTier;
      onProgress?: (progress: number) => void | Promise<void>;
    },
  ) {
    const idea = `Faceless ${args.niche} video about: ${args.topic}. Target framing: ${args.aspectRatio}.`;
    if (!this.hybridPipeline.isHybridEnabled()) {
      throw new BadGatewayException(
        'OpenAI video generation is not configured (set OPENAI_API_KEY)',
      );
    }
    return this.hybridPipeline.runHybridPipeline(userId, {
      idea,
      aspectRatio: args.aspectRatio,
      videoLength: args.videoLength,
      folder: 'auravid/creation/faceless-video',
      tone: 'clear and engaging',
      onProgress: args.onProgress,
    });
  }

  async studioYoutubeRepurpose(
    userId: string,
    args: {
      youtubeUrl: string;
      customScript?: string;
      additionalPhotos: string[];
      videoLength?: VideoLengthTier;
      onProgress?: (progress: number) => void | Promise<void>;
    },
  ) {
    const idea = [
      'Repurpose this into a fresh short-form video.',
      `Source: ${args.youtubeUrl}`,
      args.customScript ? `Director notes: ${args.customScript}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (this.hybridPipeline.isHybridEnabled()) {
      const hybridIdea = [
        idea,
        args.customScript ? `Script: ${args.customScript}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      return this.hybridPipeline.runHybridPipeline(userId, {
        idea: hybridIdea,
        aspectRatio: '9:16',
        videoLength: args.videoLength,
        folder: 'auravid/creation/youtube-repurpose',
        tone: 'punchy viral short',
        onProgress: args.onProgress,
      });
    }

    const enriched = await this.openAiService.generateVideoPrompt({
      idea,
      tone: 'punchy',
      style: 'repurposed viral short',
      targetAudience: 'general',
    });

    return this.runAiVideoPipeline(userId, {
      basePrompt: enriched,
      videoLength: args.videoLength,
      folder: 'auravid/creation/youtube-repurpose',
      aspectRatio: '9:16',
      onProgress: args.onProgress,
      startImageUrl: args.additionalPhotos[0],
    });
  }

  async studioPhotosScript(
    userId: string,
    args: { photos: string[]; script: string; videoLength?: VideoLengthTier },
  ): Promise<{
    secureUrl: string | null;
    thumbnailUrl: string | null;
    durationSeconds?: number;
    outputVideoUrls?: string[];
    hasAudio?: boolean;
    isVideo: boolean;
  }> {
    const idea = [
      'Create one hero still / keyframe image for a photo-driven narrated video.',
      `Script / narration direction: ${args.script}`,
      `Reference photo URLs: ${args.photos.join(' | ')}`,
    ].join('\n');

    const enriched = await this.openAiService.generateVideoPrompt({
      idea,
      tone: 'warm',
      style: 'high-end thumbnail still, sharp subject, readable at small size',
      targetAudience: 'social feed viewers',
    });

    const useKenBurns =
      this.config.get<string>('VIDEO_PHOTOS_SCRIPT_KEN_BURNS', 'true') === 'true';

    const imagePromise = this.openAiMedia.generateStudioImage(userId, enriched, {
      folder: 'auravid/creation/photos-script',
      aspectRatio: '9:16',
    });

    const [imageResult, narration] = await Promise.all([
      imagePromise,
      this.openAiService.generateVideoPrompt({
        idea: `Narration for photo video: ${args.script}`,
        tone: 'engaging',
        style: 'social',
        targetAudience: 'general',
      }).catch(() => args.script),
    ]);
    const keyframeUrl = imageResult.cloudinary?.secureUrl ?? null;

    if (!keyframeUrl) {
      return {
        secureUrl: null,
        thumbnailUrl: null,
        isVideo: false,
      };
    }

    if (useKenBurns) {
      try {
        const targetSeconds = this.modelRouter.getTierTargetSeconds(
          args.videoLength ?? 'short',
        );
        const tempDir =
          this.config.get<string>('FFMPEG_TEMP_DIR') ??
          path.join(os.tmpdir(), 'auravid-render');
        fs.mkdirSync(tempDir, { recursive: true });
        const outputPath = path.join(
          tempDir,
          `photos-${userId}-${Date.now()}.mp4`,
        );
        const composedPath = path.join(
          tempDir,
          `photos-composed-${userId}-${Date.now()}.mp4`,
        );
        const narrationAudio = await this.openAiTts.synthesizeNarration(
          narration,
        );
        await this.ffmpegRenderer.createKenBurnsFromImage(
          keyframeUrl,
          targetSeconds,
          '9:16',
          outputPath,
        );
        await this.ffmpegRenderer.compose({
          scenes: [
            {
              filePath: outputPath,
              durationSeconds: targetSeconds,
              caption: 'Stay consistent every day',
            },
          ],
          narrationPath: narrationAudio.filePath,
          aspectRatio: '9:16',
          outputPath: composedPath,
        });
        const uploaded = await this.cloudinaryService.uploadFromFile({
          filePath: composedPath,
          folder: 'auravid/creation/photos-script',
          publicIdPrefix: `user-${userId}`,
          resourceType: 'video',
        });
        try {
          fs.unlinkSync(outputPath);
          fs.unlinkSync(composedPath);
          fs.unlinkSync(narrationAudio.filePath);
        } catch {
          /* ignore */
        }
        return {
          secureUrl: uploaded.secure_url,
          thumbnailUrl: keyframeUrl,
          durationSeconds: targetSeconds,
          outputVideoUrls: [uploaded.secure_url],
          hasAudio: true,
          isVideo: true,
        };
      } catch {
        /* fall through to AI animate */
      }
    }

    const animate =
      this.config.get<string>('VIDEO_PHOTOS_SCRIPT_ANIMATE_VIDEO', 'true') ===
      'true';
    if (!animate) {
      return {
        secureUrl: keyframeUrl,
        thumbnailUrl: keyframeUrl,
        isVideo: false,
      };
    }

    try {
      const video = await this.runAiVideoPipeline(userId, {
        basePrompt: narration,
        videoLength: args.videoLength,
        folder: 'auravid/creation/photos-script',
        aspectRatio: '9:16',
        startImageUrl: keyframeUrl,
      });
      return {
        secureUrl: video.secureUrl,
        thumbnailUrl: keyframeUrl,
        durationSeconds: video.durationSeconds,
        outputVideoUrls: video.outputVideoUrls,
        hasAudio: video.hasAudio,
        isVideo: true,
      };
    } catch {
      return {
        secureUrl: keyframeUrl,
        thumbnailUrl: keyframeUrl,
        isVideo: false,
      };
    }
  }

  /** OpenAI video pipeline with optional multi-segment composition. */
  private async runAiVideoPipeline(
    userId: string,
    args: {
      basePrompt: string;
      videoLength?: VideoLengthTier;
      folder: string;
      aspectRatio: string;
      onProgress?: (progress: number) => void | Promise<void>;
      startImageUrl?: string;
    },
  ) {
    const segmentConfig = this.modelRouter.getVideoSegmentConfig(
      args.videoLength,
    );
    const scenes =
      segmentConfig.segmentCount > 1
        ? await this.openAiService.generateVideoScenePrompts({
            idea: args.basePrompt,
            segmentCount: segmentConfig.segmentCount,
            secondsPerSegment: segmentConfig.secondsPerSegment,
          })
        : [args.basePrompt];

    const sourceUrls: string[] = [];
    const clipPaths: string[] = [];
    let model = 'openai';
    const tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(tempDir, { recursive: true });

    for (let i = 0; i < scenes.length; i++) {
      const result = await this.mediaChain.generateVideo({
        prompt: `${scenes[i]}. No text, no signs, no logos, no writing, no subtitles, no screens.`,
        aspectRatio: args.aspectRatio,
        durationSeconds: segmentConfig.secondsPerSegment,
        imageUrl: i === 0 ? args.startImageUrl : undefined,
      });
      const url = result.outputUrls[0];
      if (url) {
        const clipPath = await this.downloadVideoToTemp(url, `ai-${userId}-${i}`);
        clipPaths.push(clipPath);
        sourceUrls.push(url);
        model = `${result.provider}:${result.model}`;
      }
      if (args.onProgress) {
        const pct = Math.round(20 + (70 * (i + 1)) / scenes.length);
        await args.onProgress(pct);
      }
    }

    if (clipPaths.length === 0) {
      throw new BadGatewayException('AI video pipeline produced no outputs');
    }

    const totalDuration = this.modelRouter.getTierTargetSeconds(
      args.videoLength ?? 'short',
    );
    let narrationPath: string | undefined;
    try {
      const narration = await this.openAiTts.synthesizeNarration(
        scenes
          .map((scene, i) => `Scene ${i + 1}. ${scene}`)
          .join(' ')
          .slice(0, 1800),
      );
      narrationPath = narration.filePath;
    } catch (err) {
      if (this.config.get<string>('VIDEO_REQUIRE_NARRATION', 'true') === 'true') {
        throw new BadGatewayException(
          `Narration generation failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const outputPath = path.join(tempDir, `ai-final-${userId}-${Date.now()}.mp4`);
    const composed = await this.ffmpegRenderer.compose({
      scenes: clipPaths.map((filePath, i) => ({
        filePath,
        durationSeconds: totalDuration / clipPaths.length,
        caption: `Scene ${i + 1}`,
      })),
      narrationPath,
      aspectRatio: args.aspectRatio,
      outputPath,
    });
    const uploaded = await this.cloudinaryService.uploadFromFile({
      filePath: composed.outputPath,
      folder: args.folder,
      publicIdPrefix: `user-${userId}`,
      resourceType: 'video',
    });

    for (const filePath of [...clipPaths, outputPath, narrationPath].filter(
      (p): p is string => Boolean(p),
    )) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }

    return {
      secureUrl: uploaded.secure_url,
      outputVideoUrls: sourceUrls,
      durationSeconds: composed.durationSeconds,
      model,
      hasAudio: Boolean(narrationPath),
      segmentCount: scenes.length,
    };
  }

  private async downloadVideoToTemp(url: string, prefix: string): Promise<string> {
    const axios = (await import('axios')).default;
    const tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(tempDir, { recursive: true });
    const out = path.join(tempDir, `${prefix}-${Date.now()}.mp4`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120_000,
    });
    fs.writeFileSync(out, Buffer.from(response.data));
    return out;
  }

}
