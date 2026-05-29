import { GoogleGenAI, type GenerateVideosOperation, type Image } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  MediaGenerationProvider,
  VideoGenerationRequest,
  VideoGenerationResult,
} from '../providers/media-generation.provider';
import { ProviderError } from '../utils/provider-error';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class GoogleVeoMediaService implements MediaGenerationProvider {
  readonly name = 'google-veo';
  private readonly logger = new Logger(GoogleVeoMediaService.name);
  private readonly apiKey: string | undefined;
  private readonly client: GoogleGenAI | null;
  private readonly model: string;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;
  private readonly resolution: string;
  private readonly personGeneration: string | undefined;
  private readonly tempDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.apiKey =
      this.config.get<string>('GOOGLE_API_KEY') ??
      this.config.get<string>('GEMINI_API_KEY') ??
      this.config.get<string>('GOOGLE_AI_API_KEY');
    this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    this.model = this.config.get<string>(
      'GOOGLE_VEO_MODEL',
      'veo-3.1-generate-preview',
    );
    this.pollIntervalMs = Number(
      this.config.get<string>('GOOGLE_VEO_POLL_INTERVAL_MS', '10000'),
    );
    this.maxWaitMs = Number(
      this.config.get<string>('GOOGLE_VEO_MAX_WAIT_MS', '900000'),
    );
    this.resolution = this.config.get<string>('GOOGLE_VEO_RESOLUTION', '720p');
    this.personGeneration = this.config.get<string>('GOOGLE_VEO_PERSON_GENERATION');
    this.tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    if (!this.client) {
      throw new Error(
        'Google Veo is not configured (set GOOGLE_API_KEY from Google AI Studio)',
      );
    }

    const outputPath = path.join(this.tempDir, `google-veo-${Date.now()}.mp4`);
    const operation = await this.createOperation(request);
    this.logger.log(
      `Veo operation ${operation.name ?? 'unknown'} created (${this.model}): ${request.prompt.slice(0, 280)}`,
    );

    const completed = await this.pollOperation(operation);
    const generated = completed.response?.generatedVideos?.[0];
    if (!generated?.video) {
      throw new ProviderError(
        'Google Veo returned no generated video',
        this.name,
        completed.name,
        completed,
      );
    }

    try {
      await this.client.files.download({
        file: generated.video,
        downloadPath: outputPath,
      });
      const uploaded = await this.cloudinary.uploadFromFile({
        filePath: outputPath,
        folder: 'auravid/temp-google-veo-video',
        publicIdPrefix: `google-veo-clip-${Date.now()}`,
        resourceType: 'video',
      });
      return {
        outputUrls: [uploaded.secure_url],
        model: this.model,
        provider: this.name,
      };
    } finally {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        /* ignore */
      }
    }
  }

  private async createOperation(
    request: VideoGenerationRequest,
  ): Promise<GenerateVideosOperation> {
    if (!this.client) {
      throw new Error('Google Veo client is not configured');
    }
    const image = request.imageUrl
      ? await this.downloadImageReference(request.imageUrl)
      : undefined;
    const config: Record<string, unknown> = {
      numberOfVideos: 1,
      durationSeconds: this.snapDurationSeconds(
        request.durationSeconds ?? 4,
        Boolean(image),
      ),
      aspectRatio: this.mapAspectRatio(request.aspectRatio ?? '16:9'),
      resolution: this.resolution,
    };
    if (this.personGeneration) {
      config.personGeneration = this.personGeneration;
    }

    try {
      return await this.client.models.generateVideos({
        model: this.model,
        prompt: request.prompt,
        image,
        config,
      });
    } catch (err) {
      throw new ProviderError(
        this.extractErrorMessage(err),
        this.name,
        undefined,
        this.extractRawError(err),
      );
    }
  }

  private async pollOperation(
    operation: GenerateVideosOperation,
  ): Promise<GenerateVideosOperation> {
    if (!this.client) {
      throw new Error('Google Veo client is not configured');
    }
    const started = Date.now();
    let current = operation;
    while (!current.done && Date.now() - started < this.maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      current = await this.client.operations.getVideosOperation({
        operation: current,
      });
    }

    if (!current.done) {
      throw new ProviderError(
        `Google Veo generation timed out after ${this.maxWaitMs}ms`,
        this.name,
        current.name,
        current,
      );
    }
    if (current.error) {
      throw new ProviderError(
        this.extractOperationErrorMessage(current.error),
        this.name,
        current.name,
        current,
      );
    }
    return current;
  }

  private async downloadImageReference(imageUrl: string): Promise<Image> {
    const response = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    const contentType = response.headers['content-type'];
    return {
      imageBytes: Buffer.from(response.data).toString('base64'),
      mimeType:
        typeof contentType === 'string' && contentType.startsWith('image/')
          ? contentType
          : 'image/png',
    };
  }

  private snapDurationSeconds(seconds: number, hasImage: boolean): 4 | 6 | 8 {
    if (hasImage || this.resolution === '1080p' || this.resolution === '4k') {
      return 8;
    }
    if (seconds <= 5) return 4;
    if (seconds <= 7) return 6;
    return 8;
  }

  private mapAspectRatio(aspectRatio: string): '16:9' | '9:16' {
    const normalized = aspectRatio.replace(/\s/g, '');
    return normalized === '9:16' ? '9:16' : '16:9';
  }

  private extractOperationErrorMessage(error: Record<string, unknown>): string {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    return 'Google Veo video generation failed';
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }

  private extractRawError(err: unknown): unknown {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    return err;
  }
}
