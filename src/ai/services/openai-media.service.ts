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

type OpenAiVideoJob = {
  id: string;
  status: string;
  error?: { message?: string; code?: string };
};

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

@Injectable()
export class OpenAiMediaService implements MediaGenerationProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiMediaService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly videoModel: string;
  private readonly imageModel: string;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;
  private readonly imageTimeoutMs: number;
  private readonly tempDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.videoModel = this.config.get<string>(
      'OPENAI_VIDEO_MODEL',
      'sora-2',
    );
    this.imageModel = this.config.get<string>(
      'OPENAI_IMAGE_MODEL',
      'gpt-image-1',
    );
    this.pollIntervalMs = Number(
      this.config.get<string>('OPENAI_VIDEO_POLL_INTERVAL_MS', '5000'),
    );
    this.maxWaitMs = Number(
      this.config.get<string>('OPENAI_VIDEO_MAX_WAIT_MS', '1800000'),
    );
    this.imageTimeoutMs = Number(
      this.config.get<string>('OPENAI_IMAGE_TIMEOUT_MS', '180000'),
    );
    this.tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const size = this.mapVideoSize(request.aspectRatio ?? '16:9');
    const seconds = this.snapVideoSeconds(request.durationSeconds ?? 5);
    const body: Record<string, unknown> = {
      model: this.videoModel,
      prompt: request.prompt,
      size,
      seconds,
    };
    if (request.imageUrl) {
      body.input_reference = { image_url: request.imageUrl };
    }

    const created = await this.postJson<OpenAiVideoJob>('/videos', body);
    this.logger.log(
      `Sora job ${created.id} created (${seconds}s): ${request.prompt.slice(0, 280)}`,
    );
    const completed = await this.pollVideoJob(created.id);
    const clipPath = path.join(
      this.tempDir,
      `openai-video-${Date.now()}.mp4`,
    );
    await this.downloadVideoContent(completed.id, clipPath);

    try {
      const uploaded = await this.cloudinary.uploadFromFile({
        filePath: clipPath,
        folder: 'auravid/temp-openai-video',
        publicIdPrefix: `openai-clip-${Date.now()}`,
        resourceType: 'video',
      });
      return {
        outputUrls: [uploaded.secure_url],
        model: this.videoModel,
        provider: this.name,
      };
    } finally {
      try {
        fs.unlinkSync(clipPath);
      } catch {
        /* ignore */
      }
    }
  }

  async generateStudioImage(
    userId: string,
    prompt: string,
    options: {
      folder: string;
      aspectRatio?: string;
      negativePrompt?: string;
    },
  ): Promise<{
    model: string;
    cloudinary: {
      publicId: string;
      secureUrl: string;
      width?: number;
      height?: number;
    } | null;
    outputs: string[];
  }> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const body: Record<string, unknown> = {
      model: this.imageModel,
      prompt,
      n: 1,
      size: this.mapImageSize(options.aspectRatio ?? '1:1'),
    };
    if (options.negativePrompt) {
      body.negative_prompt = options.negativePrompt;
    }

    const response = await this.postJson<OpenAiImageResponse>(
      '/images/generations',
      body,
      this.imageTimeoutMs,
    );
    const item = response.data?.[0];
    const imagePath = path.join(this.tempDir, `openai-image-${Date.now()}.png`);

    try {
      if (item?.b64_json) {
        fs.writeFileSync(imagePath, Buffer.from(item.b64_json, 'base64'));
      } else if (item?.url) {
        const img = await axios.get(item.url, {
          responseType: 'arraybuffer',
          timeout: 120_000,
        });
        fs.writeFileSync(imagePath, Buffer.from(img.data));
      } else {
        throw new Error('OpenAI image generation returned no image data');
      }

      const uploaded = await this.cloudinary.uploadFromFile({
        filePath: imagePath,
        folder: options.folder,
        publicIdPrefix: `user-${userId}`,
        resourceType: 'image',
      });

      return {
        model: this.imageModel,
        outputs: [uploaded.secure_url],
        cloudinary: {
          publicId: uploaded.public_id,
          secureUrl: uploaded.secure_url,
          width: undefined,
          height: undefined,
        },
      };
    } finally {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        /* ignore */
      }
    }
  }

  private async pollVideoJob(videoId: string): Promise<OpenAiVideoJob> {
    const started = Date.now();
    while (Date.now() - started < this.maxWaitMs) {
      const job = await this.getJson<OpenAiVideoJob>(`/videos/${videoId}`);
      if (job.status === 'completed') {
        return job;
      }
      if (job.status === 'failed') {
        const message = job.error?.message ?? 'OpenAI video generation failed';
        this.logger.warn(`Sora job ${videoId} failed: ${JSON.stringify(job)}`);
        throw new ProviderError(message, 'openai', videoId, job);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new ProviderError(
      `OpenAI video generation timed out after ${this.maxWaitMs}ms`,
      'openai',
      videoId,
      { id: videoId, status: 'timeout', maxWaitMs: this.maxWaitMs },
    );
  }

  private async downloadVideoContent(
    videoId: string,
    outputPath: string,
  ): Promise<void> {
    const response = await axios.get(
      `${this.baseUrl}/videos/${videoId}/content`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        responseType: 'arraybuffer',
        timeout: 300_000,
      },
    );
    fs.writeFileSync(outputPath, Buffer.from(response.data));
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<T> {
    try {
      const response = await axios.post<T>(`${this.baseUrl}${path}`, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      });
      return response.data;
    } catch (err) {
      const message = this.extractAxiosError(err);
      const raw = this.extractAxiosRawError(err);
      this.logger.warn(`OpenAI ${path} failed: ${JSON.stringify(raw)}`);
      throw new ProviderError(message, 'openai', undefined, raw);
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await axios.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 30_000,
    });
    return response.data;
  }

  private extractAxiosError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as
        | { error?: { message?: string } }
        | undefined;
      return data?.error?.message ?? err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private extractAxiosRawError(err: unknown): unknown {
    if (axios.isAxiosError(err)) {
      return {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
      };
    }
    return err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err;
  }

  /** Sora supports 4, 8, 12 (and 16/20 on some flows). */
  private snapVideoSeconds(seconds: number): '4' | '8' | '12' {
    if (seconds <= 6) return '4';
    if (seconds <= 10) return '8';
    return '12';
  }

  private mapVideoSize(aspectRatio: string): string {
    const n = aspectRatio.replace(/\s/g, '');
    if (n === '9:16') return '720x1280';
    if (n === '1:1') return '1024x1792';
    return '1280x720';
  }

  private mapImageSize(aspectRatio: string): string {
    const n = aspectRatio.replace(/\s/g, '');
    if (n === '9:16') return '1024x1536';
    if (n === '16:9') return '1536x1024';
    return '1024x1024';
  }
}
