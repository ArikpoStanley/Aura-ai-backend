import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { VideoLengthTier } from '../constants/replicate-use-case';
import { CloudinaryService } from './cloudinary.service';
import { FfmpegRendererService } from './ffmpeg-renderer.service';
import { MediaProviderChainService } from './media-provider-chain.service';
import { OpenAiTtsService } from './openai-tts.service';
import { OpenAiService } from './openai.service';
import { ReplicateModelRouterService } from './replicate-model-router.service';
import {
  makeSoraSafeBrollPrompt,
} from '../utils/moderation-safe-prompt';

export type HybridPipelineResult = {
  secureUrl: string | null;
  outputVideoUrls: string[];
  durationSeconds: number;
  hasAudio: boolean;
  model: string;
  segmentCount: number;
};

@Injectable()
export class HybridVideoPipelineService {
  private readonly logger = new Logger(HybridVideoPipelineService.name);
  private readonly tempDir: string;
  private readonly hybridEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly openAiService: OpenAiService,
    private readonly openAiTts: OpenAiTtsService,
    private readonly ffmpeg: FfmpegRendererService,
    private readonly mediaChain: MediaProviderChainService,
    private readonly modelRouter: ReplicateModelRouterService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.hybridEnabled =
      this.config.get<string>('VIDEO_PIPELINE_HYBRID', 'true') === 'true';
  }

  isHybridEnabled(): boolean {
    return this.hybridEnabled && this.mediaChain.hasVideoProvider();
  }

  private sceneCountForTier(videoLength?: VideoLengthTier): number {
    const target = this.modelRouter.getTierTargetSeconds(
      videoLength ?? 'short',
    );
    const perScene = Math.max(5, Math.ceil(target / 4));
    return Math.max(2, Math.min(12, Math.ceil(target / perScene)));
  }

  async runHybridPipeline(
    userId: string,
    args: {
      idea: string;
      aspectRatio: string;
      videoLength?: VideoLengthTier;
      folder: string;
      tone?: string;
      onProgress?: (progress: number) => void | Promise<void>;
    },
  ): Promise<HybridPipelineResult> {
    const targetSeconds = this.modelRouter.getTierTargetSeconds(
      args.videoLength ?? 'short',
    );
    const sceneCount = this.sceneCountForTier(args.videoLength);
    const secondsPerScene = Math.max(3, Math.ceil(targetSeconds / sceneCount));

    if (args.onProgress) {
      await args.onProgress(25);
    }

    const strictVisualSafety = this.mediaChain.requiresStrictVideoPromptSafety();
    const scenes = await this.openAiService.generateHybridScenes({
      idea: args.idea,
      sceneCount,
      secondsPerScene,
      tone: args.tone,
      strictVisualSafety,
    });

    if (args.onProgress) {
      await args.onProgress(40);
    }

    const clipPaths: string[] = [];
    const sourceUrls: string[] = [];
    const scenePrompt = (scene: (typeof scenes)[number], index: number) => {
      const prompt = strictVisualSafety
        ? `${scene.searchQuery}. Cinematic ASMR renovation b-roll of objects and environments only. No people, no humanoids, no wings, no readable text, no logos, no signs, no screens.`
        : `${scene.searchQuery}. ${scene.caption}. Cinematic short-form video, ${args.aspectRatio}, rich visual detail, smooth camera motion. No copyrighted logos, no real people, no celebrities.`;
      return strictVisualSafety
        ? makeSoraSafeBrollPrompt(prompt, index)
        : prompt.replace(/\s+/g, ' ').trim();
    };

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let clipPath: string | null = null;
      const prompt = scenePrompt(scene, i);
      this.logger.log(
        `${this.mediaChain.selectedProviderName() ?? 'video provider'} scene ${i + 1}/${scenes.length}: ${prompt.slice(0, 280)}`,
      );

      let generated;
      try {
        generated = await this.mediaChain.generateVideo({
          prompt,
          aspectRatio: args.aspectRatio,
          durationSeconds: secondsPerScene,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${this.mediaChain.selectedProviderName() ?? 'video provider'} scene ${i + 1}/${scenes.length} failed: ${message}. Prompt sent: ${prompt.slice(0, 220)}`,
        );
      }
      const url = generated.outputUrls[0];
      if (url) {
        clipPath = await this.downloadToTemp(url, `openai-${i}`);
        sourceUrls.push(url);
      }

      if (clipPath) {
        clipPaths.push(clipPath);
      }

      if (args.onProgress) {
        const pct = 40 + Math.round((35 * (i + 1)) / scenes.length);
        await args.onProgress(pct);
      }
    }

    if (clipPaths.length === 0) {
      throw new BadGatewayException(
        'OpenAI video pipeline produced no scene clips (check OPENAI_API_KEY and Sora access)',
      );
    }

    const narrationText = scenes.map((s) => s.narration).join(' ');
    let narrationPath: string | undefined;
    try {
      const narration = await this.openAiTts.synthesizeNarration(narrationText);
      narrationPath = narration.filePath;
    } catch (err) {
      if (this.config.get<string>('VIDEO_REQUIRE_NARRATION', 'true') === 'true') {
        throw new BadGatewayException(
          `Narration generation failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      this.logger.warn(
        `TTS skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (args.onProgress) {
      await args.onProgress(85);
    }

    const outputPath = path.join(this.tempDir, `final-${userId}-${Date.now()}.mp4`);
    const perClipDuration = targetSeconds / clipPaths.length;
    const composed = await this.ffmpeg.compose({
      scenes: clipPaths.map((filePath, i) => ({
        filePath,
        durationSeconds: perClipDuration,
        caption: scenes[i]?.caption,
      })),
      narrationPath,
      aspectRatio: args.aspectRatio,
      outputPath,
    });

    const uploaded = await this.cloudinary.uploadFromFile({
      filePath: composed.outputPath,
      folder: args.folder,
      publicIdPrefix: `user-${userId}`,
      resourceType: 'video',
    });

    try {
      fs.unlinkSync(composed.outputPath);
    } catch {
      /* ignore */
    }

    if (args.onProgress) {
      await args.onProgress(95);
    }

    return {
      secureUrl: uploaded.secure_url,
      outputVideoUrls: sourceUrls.length > 0 ? sourceUrls : [uploaded.secure_url],
      durationSeconds: composed.durationSeconds,
      hasAudio: Boolean(narrationPath),
      model: 'hybrid:openai+ffmpeg',
      segmentCount: clipPaths.length,
    };
  }

  private async downloadToTemp(url: string, prefix: string): Promise<string> {
    const axios = (await import('axios')).default;
    const out = path.join(this.tempDir, `${prefix}-${Date.now()}.mp4`);
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120_000,
    });
    fs.writeFileSync(out, Buffer.from(res.data));
    return out;
  }
}
