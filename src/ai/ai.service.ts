import { Injectable } from '@nestjs/common';
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
}
