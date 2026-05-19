import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReplicateUseCase } from './constants/replicate-use-case';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GeneratePromptDto } from './dto/generate-prompt.dto';
import { RemixVideoDto } from './dto/remix-video.dto';
import { OpenAiService } from './services/openai.service';
import { CloudinaryService } from './services/cloudinary.service';
import {
  ReplicateModelRouterService,
  ReplicateRunPlan,
} from './services/replicate-model-router.service';
import { ReplicateService } from './services/replicate.service';
import {
  applyEnglishImagePrompt,
  isEnglishLanguage,
} from './constants/generation-language';
import type { VideoLengthTier } from './constants/replicate-use-case';

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly openAiService: OpenAiService,
    private readonly replicateService: ReplicateService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly modelRouter: ReplicateModelRouterService,
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

    const plan = this.modelRouter.buildImagePlan(
      ReplicateUseCase.ImageGenerate,
      prompt,
      {
        aspectRatio: dto.aspectRatio,
      },
    );
    if (dto.negativePrompt) {
      plan.input.negative_prompt = dto.negativePrompt;
    }

    return this.runImagePlan(userId, plan, 'auravid/generated-images');
  }

  async generateCharacter(userId: string, dto: GenerateCharacterDto) {
    const characterPrompt =
      await this.openAiService.generateCharacterPrompt(dto);
    const plan = this.modelRouter.buildImagePlan(
      ReplicateUseCase.CharacterGenerate,
      characterPrompt,
      { aspectRatio: '1:1' },
    );
    const image = await this.runImagePlan(
      userId,
      plan,
      'auravid/generated-characters',
    );
    return {
      prompt: characterPrompt,
      ...image,
      model: plan.model,
    };
  }

  async remixVideo(userId: string, dto: RemixVideoDto) {
    const remixPrompt = await this.openAiService.generateVideoPrompt({
      idea: `Remix this source video: ${dto.sourceVideoUrl}. Instruction: ${dto.instruction}`,
      style: 'video remix',
      tone: 'creative but faithful to source intent',
    });

    const plans = dto.model
      ? [
          {
            model: dto.model,
            input: {
              prompt: remixPrompt,
              video: dto.sourceVideoUrl,
              ...dto.inputOverrides,
            },
            timeoutMs: 300_000,
          } satisfies ReplicateRunPlan,
        ]
      : this.modelRouter.buildRemixPlan(remixPrompt, {
          sourceVideoUrl: dto.sourceVideoUrl,
        });

    const result = await this.runVideoPlansUntilSuccess(
      userId,
      plans,
      'auravid/generated-videos',
    );

    return {
      predictionId: result.predictionId,
      model: result.model,
      prompt: remixPrompt,
      outputs: result.outputUrls,
      cloudinary: result.cloudinary,
    };
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
    return this.runStudioSegmentedVideo(userId, {
      basePrompt: enriched,
      videoLength: args.videoLength,
      folder: 'auravid/creation/text-to-video',
      onProgress: args.onProgress,
      buildPlan: (scenePrompt, durationSeconds) =>
        this.modelRouter.buildTextToVideoPlan(scenePrompt, {
          videoLength: args.videoLength,
          aspectRatio: '16:9',
          durationSeconds,
        }),
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
    const enriched = await this.openAiService.generateVideoPrompt({
      idea,
      tone: 'clear and engaging',
      style: 'faceless social video',
      targetAudience: args.niche,
    });
    return this.runStudioSegmentedVideo(userId, {
      basePrompt: enriched,
      videoLength: args.videoLength,
      folder: 'auravid/creation/faceless-video',
      onProgress: args.onProgress,
      buildPlan: (scenePrompt, durationSeconds) =>
        this.modelRouter.buildFacelessVideoPlan(scenePrompt, {
          aspectRatio: args.aspectRatio,
          videoLength: args.videoLength,
          durationSeconds,
        }),
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

    const enriched = await this.openAiService.generateVideoPrompt({
      idea,
      tone: 'punchy',
      style: 'repurposed viral short',
      targetAudience: 'general',
    });

    if (args.videoLength === 'long') {
      return this.runStudioSegmentedVideo(userId, {
        basePrompt: enriched,
        videoLength: args.videoLength,
        folder: 'auravid/creation/youtube-repurpose',
        onProgress: args.onProgress,
        buildPlan: (scenePrompt, durationSeconds) =>
          this.modelRouter.buildTextToVideoPlan(scenePrompt, {
            videoLength: args.videoLength,
            aspectRatio: '9:16',
            durationSeconds,
          }),
      });
    }

    const startImage = args.additionalPhotos[0];
    const plans = this.modelRouter.buildYoutubeRepurposePlans(enriched, {
      youtubeUrl: args.youtubeUrl,
      startImageUrl: startImage,
      videoLength: args.videoLength,
    });

    const result = await this.runVideoPlansUntilSuccess(
      userId,
      plans,
      'auravid/creation/youtube-repurpose',
    );
    return {
      secureUrl: result.cloudinary?.secureUrl ?? null,
      outputVideoUrls: result.cloudinary?.secureUrl
        ? [result.cloudinary.secureUrl]
        : [],
      durationSeconds: result.cloudinary?.duration,
      model: result.model,
      hasAudio: this.modelRouter.wantsVideoAudio(),
      segmentCount: 1,
    };
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

    const imagePlan = this.modelRouter.buildImagePlan(
      ReplicateUseCase.PhotosScriptImage,
      enriched,
      { imageUrl: args.photos[0] },
    );

    const animate =
      this.config.get<string>('REPLICATE_PHOTOS_SCRIPT_ANIMATE_VIDEO', 'true') ===
      'true';

    const [imageResult, videoPrompt] = await Promise.all([
      this.runImagePlan(userId, imagePlan, 'auravid/creation/photos-script'),
      animate
        ? this.openAiService.generateVideoPrompt({
            idea: `Animate this photo slideshow video. Narration: ${args.script}`,
            style: 'smooth ken burns motion, social video',
            tone: 'engaging',
            targetAudience: 'general',
          })
        : Promise.resolve(null),
    ]);
    const keyframeUrl = imageResult.cloudinary?.secureUrl ?? null;

    if (!animate || !keyframeUrl || !videoPrompt) {
      return {
        secureUrl: keyframeUrl,
        thumbnailUrl: keyframeUrl,
        isVideo: false,
      };
    }

    try {
      const video = await this.runStudioSegmentedVideo(userId, {
        basePrompt: videoPrompt,
        videoLength: args.videoLength,
        folder: 'auravid/creation/photos-script',
        buildPlan: (scenePrompt, durationSeconds) =>
          this.modelRouter.buildImageToVideoPlan(scenePrompt, keyframeUrl, {
            videoLength: args.videoLength,
            aspectRatio: '9:16',
            useCase: ReplicateUseCase.PhotosScriptVideo,
            durationSeconds,
          }),
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

  async runStudioSegmentedVideo(
    userId: string,
    args: {
      basePrompt: string;
      videoLength?: VideoLengthTier;
      folder: string;
      buildPlan: (scenePrompt: string, durationSeconds: number) => ReplicateRunPlan;
      onProgress?: (progress: number) => void | Promise<void>;
    },
  ): Promise<{
    secureUrl: string | null;
    outputVideoUrls: string[];
    durationSeconds?: number;
    model: string;
    hasAudio: boolean;
    segmentCount: number;
  }> {
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

    const maxParallel = this.modelRouter.getVideoMaxParallel();
    const segmentResults = await this.mapWithConcurrency(
      scenes,
      scenes.length > 1 ? maxParallel : 1,
      async (scenePrompt, index) => {
        const plan = args.buildPlan(
          scenePrompt,
          segmentConfig.secondsPerSegment,
        );
        const result = await this.runVideoPlansUntilSuccess(
          userId,
          [plan],
          args.folder,
        );
        return {
          index,
          model: plan.model,
          url: result.cloudinary?.secureUrl,
          duration:
            result.cloudinary?.duration ?? segmentConfig.secondsPerSegment,
        };
      },
      async (completedCount) => {
        if (args.onProgress) {
          const pct = Math.round(20 + (70 * completedCount) / scenes.length);
          await args.onProgress(pct);
        }
      },
    );

    segmentResults.sort((a, b) => a.index - b.index);
    const outputVideoUrls = segmentResults
      .map((s) => s.url)
      .filter((url): url is string => Boolean(url));
    const totalDuration = segmentResults.reduce((sum, s) => sum + s.duration, 0);
    const model = segmentResults[segmentResults.length - 1]?.model ?? '';

    if (outputVideoUrls.length === 0) {
      throw new BadGatewayException('Video generation produced no outputs');
    }

    return {
      secureUrl: outputVideoUrls[0],
      outputVideoUrls,
      durationSeconds: totalDuration,
      model,
      hasAudio: this.modelRouter.wantsVideoAudio(),
      segmentCount: scenes.length,
    };
  }

  /** Run async work over items with a concurrency cap; optional hook after each item completes. */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    onItemComplete?: (completedCount: number) => void | Promise<void>,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let completed = 0;
    const workerCount = Math.min(Math.max(1, limit), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= items.length) {
            break;
          }
          results[i] = await fn(items[i], i);
          completed += 1;
          if (onItemComplete) {
            await onItemComplete(completed);
          }
        }
      }),
    );

    return results;
  }

  private async runVideoPlansUntilSuccess(
    userId: string,
    plans: ReplicateRunPlan[],
    folder: string,
  ) {
    let lastError: unknown;
    for (const plan of plans) {
      try {
        const prediction = await this.replicateService.runModel(plan);
        const firstOutputUrl = prediction.outputUrls[0];
        if (!firstOutputUrl) {
          continue;
        }
        const uploaded = await this.cloudinaryService.uploadFromUrl({
          sourceUrl: firstOutputUrl,
          folder,
          publicIdPrefix: `user-${userId}`,
          resourceType: 'video',
        });
        return {
          predictionId: prediction.predictionId,
          model: plan.model,
          outputUrls: prediction.outputUrls,
          cloudinary: {
            publicId: uploaded.public_id,
            secureUrl: uploaded.secure_url,
            duration: uploaded.duration,
            format: uploaded.format,
          },
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof BadGatewayException
      ? lastError
      : new BadGatewayException(
          lastError instanceof Error
            ? lastError.message
            : 'Video generation failed for all configured models',
        );
  }

  private async runImagePlan(
    userId: string,
    plan: ReplicateRunPlan,
    folder: string,
  ) {
    const prediction = await this.replicateService.runModel(plan);
    const firstOutputUrl = prediction.outputUrls[0];
    if (!firstOutputUrl) {
      return {
        predictionId: prediction.predictionId,
        model: plan.model,
        cloudinary: null,
        outputs: [],
      };
    }

    const uploaded = await this.cloudinaryService.uploadFromUrl({
      sourceUrl: firstOutputUrl,
      folder,
      publicIdPrefix: `user-${userId}`,
      resourceType: 'image',
    });

    return {
      predictionId: prediction.predictionId,
      model: plan.model,
      outputs: prediction.outputUrls,
      cloudinary: {
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        width: uploaded.width,
        height: uploaded.height,
      },
    };
  }
}
