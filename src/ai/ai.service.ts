import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicService } from './services/anthropic.service';
import { CloudinaryService } from './services/cloudinary.service';
import { ReplicateService } from './services/replicate.service';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GeneratePromptDto } from './dto/generate-prompt.dto';
import { RemixVideoDto } from './dto/remix-video.dto';

@Injectable()
export class AiService {
  private readonly defaultImageModel: string;
  private readonly defaultVideoModel: string;

  constructor(
    private readonly config: ConfigService,
    private readonly anthropicService: AnthropicService,
    private readonly replicateService: ReplicateService,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    this.defaultImageModel = this.config.get<string>(
      'REPLICATE_IMAGE_MODEL',
      'black-forest-labs/flux-schnell',
    );
    this.defaultVideoModel = this.config.get<string>(
      'REPLICATE_VIDEO_MODEL',
      'kwaivgi/kling-v1.6-standard',
    );
  }

  async generatePrompt(dto: GeneratePromptDto) {
    const prompt = await this.anthropicService.generateVideoPrompt(dto);
    return { prompt };
  }

  async generateImage(userId: string, dto: GenerateImageDto) {
    const prompt = [
      dto.prompt,
      dto.style ? `style: ${dto.style}` : null,
      dto.aspectRatio ? `aspect ratio: ${dto.aspectRatio}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const input: Record<string, unknown> = { prompt };
    if (dto.negativePrompt) {
      input.negative_prompt = dto.negativePrompt;
    }

    const prediction = await this.replicateService.runModel({
      model: this.defaultImageModel,
      input,
    });

    const firstOutputUrl = prediction.outputUrls[0];
    if (!firstOutputUrl) {
      return {
        predictionId: prediction.predictionId,
        cloudinary: null,
        outputs: [],
      };
    }

    const uploaded = await this.cloudinaryService.uploadFromUrl({
      sourceUrl: firstOutputUrl,
      folder: 'auravid/generated-images',
      publicIdPrefix: `user-${userId}`,
      resourceType: 'image',
    });

    return {
      predictionId: prediction.predictionId,
      outputs: prediction.outputUrls,
      cloudinary: {
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        width: uploaded.width,
        height: uploaded.height,
      },
    };
  }

  async generateCharacter(userId: string, dto: GenerateCharacterDto) {
    const characterPrompt =
      await this.anthropicService.generateCharacterPrompt(dto);
    const image = await this.generateImage(userId, {
      prompt: characterPrompt,
      style: dto.style,
    });
    return {
      prompt: characterPrompt,
      ...image,
    };
  }

  async remixVideo(userId: string, dto: RemixVideoDto) {
    const remixPrompt = await this.anthropicService.generateVideoPrompt({
      idea: `Remix this source video: ${dto.sourceVideoUrl}. Instruction: ${dto.instruction}`,
      style: 'video remix',
      tone: 'creative but faithful to source intent',
    });

    const model = dto.model ?? this.defaultVideoModel;
    const input: Record<string, unknown> = {
      prompt: remixPrompt,
      video: dto.sourceVideoUrl,
      ...dto.inputOverrides,
    };

    const prediction = await this.replicateService.runModel({
      model,
      input,
      timeoutMs: 240_000,
    });

    const firstOutputUrl = prediction.outputUrls[0];
    if (!firstOutputUrl) {
      return {
        predictionId: prediction.predictionId,
        model,
        prompt: remixPrompt,
        cloudinary: null,
        outputs: [],
      };
    }

    const uploaded = await this.cloudinaryService.uploadFromUrl({
      sourceUrl: firstOutputUrl,
      folder: 'auravid/generated-videos',
      publicIdPrefix: `user-${userId}`,
      resourceType: 'video',
    });

    return {
      predictionId: prediction.predictionId,
      model,
      prompt: remixPrompt,
      outputs: prediction.outputUrls,
      cloudinary: {
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        duration: uploaded.duration,
        format: uploaded.format,
      },
    };
  }

  /**
   * Video creation modes → `REPLICATE_VIDEO_MODEL` (text / faceless / repurpose).
   * Photos+script → `REPLICATE_IMAGE_MODEL` (keyframe / thumbnail still).
   */

  async studioTextToVideo(
    userId: string,
    args: { prompt: string; voiceStyle: string; visualStyle: string },
  ): Promise<{ secureUrl: string | null; durationSeconds?: number }> {
    const enriched = await this.anthropicService.generateVideoPrompt({
      idea: args.prompt,
      tone: args.voiceStyle.replaceAll('_', ' '),
      style: args.visualStyle.replaceAll('_', ' '),
      targetAudience: 'general',
    });
    return this.runVideoModelAndUpload(
      userId,
      enriched,
      'auravid/creation/text-to-video',
    );
  }

  async studioFacelessVideo(
    userId: string,
    args: { topic: string; niche: string; aspectRatio: string },
  ): Promise<{ secureUrl: string | null; durationSeconds?: number }> {
    const idea = `Faceless ${args.niche} video about: ${args.topic}. Target framing: ${args.aspectRatio}.`;
    const enriched = await this.anthropicService.generateVideoPrompt({
      idea,
      tone: 'clear and engaging',
      style: 'faceless social video',
      targetAudience: args.niche,
    });
    return this.runVideoModelAndUpload(
      userId,
      enriched,
      'auravid/creation/faceless-video',
    );
  }

  async studioYoutubeRepurpose(
    userId: string,
    args: {
      youtubeUrl: string;
      customScript?: string;
      additionalPhotos: string[];
    },
  ): Promise<{ secureUrl: string | null; durationSeconds?: number }> {
    const idea = [
      'Repurpose this into a fresh short-form video.',
      `Source: ${args.youtubeUrl}`,
      args.customScript ? `Director notes: ${args.customScript}` : null,
      args.additionalPhotos.length
        ? `Reference image URLs: ${args.additionalPhotos.join(' | ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const enriched = await this.anthropicService.generateVideoPrompt({
      idea,
      tone: 'punchy',
      style: 'repurposed viral short',
      targetAudience: 'general',
    });

    try {
      return await this.runVideoModelAndUpload(
        userId,
        enriched,
        'auravid/creation/youtube-repurpose',
        { video: args.youtubeUrl },
      );
    } catch (firstError) {
      const fallbackPrompt = `${enriched}\n\n(Context: source was ${args.youtubeUrl} — generate a new standalone short that captures the same intent.)`;
      try {
        return await this.runVideoModelAndUpload(
          userId,
          fallbackPrompt,
          'auravid/creation/youtube-repurpose',
        );
      } catch {
        throw firstError instanceof BadGatewayException
          ? firstError
          : new BadGatewayException(
              firstError instanceof Error
                ? firstError.message
                : 'Video generation failed',
            );
      }
    }
  }

  async studioPhotosScriptImage(
    userId: string,
    args: { photos: string[]; script: string },
  ): Promise<{ secureUrl: string | null }> {
    const idea = [
      'Create one hero still / keyframe image for a photo-driven narrated video.',
      `Script / narration direction: ${args.script}`,
      `Reference photo URLs (match mood and subject continuity): ${args.photos.join(' | ')}`,
    ].join('\n');

    const enriched = await this.anthropicService.generateVideoPrompt({
      idea,
      tone: 'warm',
      style: 'high-end thumbnail still, sharp subject, readable at small size',
      targetAudience: 'social feed viewers',
    });

    const input: Record<string, unknown> = { prompt: enriched };
    const useImageInput =
      this.config.get<string>('REPLICATE_PHOTOS_SCRIPT_IMAGE_INPUT', 'true') !==
      'false';
    const firstPhoto = args.photos[0];
    if (useImageInput && firstPhoto) {
      input.image = firstPhoto;
    }

    const prediction = await this.replicateService.runModel({
      model: this.defaultImageModel,
      input,
      timeoutMs: 180_000,
    });

    const firstOutputUrl = prediction.outputUrls[0];
    if (!firstOutputUrl) {
      return { secureUrl: null };
    }

    const uploaded = await this.cloudinaryService.uploadFromUrl({
      sourceUrl: firstOutputUrl,
      folder: 'auravid/creation/photos-script',
      publicIdPrefix: `user-${userId}`,
      resourceType: 'image',
    });

    return { secureUrl: uploaded.secure_url || null };
  }

  private async runVideoModelAndUpload(
    userId: string,
    prompt: string,
    folder: string,
    extraInput: Record<string, unknown> = {},
  ): Promise<{ secureUrl: string | null; durationSeconds?: number }> {
    const prediction = await this.replicateService.runModel({
      model: this.defaultVideoModel,
      input: { prompt, ...extraInput },
      timeoutMs: 300_000,
    });

    const firstOutputUrl = prediction.outputUrls[0];
    if (!firstOutputUrl) {
      return { secureUrl: null };
    }

    const uploaded = await this.cloudinaryService.uploadFromUrl({
      sourceUrl: firstOutputUrl,
      folder,
      publicIdPrefix: `user-${userId}`,
      resourceType: 'video',
    });

    return {
      secureUrl: uploaded.secure_url || null,
      durationSeconds: uploaded.duration,
    };
  }
}
