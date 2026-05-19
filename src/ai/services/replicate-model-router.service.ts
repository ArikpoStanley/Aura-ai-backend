import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applyEnglishImagePrompt,
  applyEnglishVideoPrompt,
  isEnglishLanguage,
} from '../constants/generation-language';
import {
  ReplicateUseCase,
  VideoLengthTier,
} from '../constants/replicate-use-case';

export type ReplicateRunPlan = {
  model: string;
  input: Record<string, unknown>;
  timeoutMs: number;
};

@Injectable()
export class ReplicateModelRouterService {
  private readonly usePremium: boolean;
  private readonly useEnglish: boolean;

  constructor(private readonly config: ConfigService) {
    this.usePremium =
      this.config.get<string>('REPLICATE_USE_PREMIUM', 'false') === 'true';
    this.useEnglish = isEnglishLanguage(
      this.config.get<string>('GENERATION_DEFAULT_LANGUAGE'),
    );
  }

  private localizeVideoPrompt(prompt: string): string {
    return this.useEnglish ? applyEnglishVideoPrompt(prompt) : prompt.trim();
  }

  private localizeImagePrompt(prompt: string): string {
    return this.useEnglish ? applyEnglishImagePrompt(prompt) : prompt.trim();
  }

  resolveModel(useCase: ReplicateUseCase): string {
    const pick = (standardKey: string, premiumKey: string, fallback: string) => {
      if (this.usePremium) {
        return (
          this.config.get<string>(premiumKey) ??
          this.config.get<string>(standardKey) ??
          fallback
        );
      }
      return this.config.get<string>(standardKey) ?? fallback;
    };

    switch (useCase) {
      case ReplicateUseCase.TextToVideo:
      case ReplicateUseCase.FacelessVideo:
        return pick(
          'REPLICATE_VIDEO_T2V_MODEL',
          'REPLICATE_VIDEO_T2V_PREMIUM',
          'wavespeedai/wan-2.1-t2v-480p',
        );
      case ReplicateUseCase.YoutubeRepurpose:
      case ReplicateUseCase.PhotosScriptVideo:
        return pick(
          'REPLICATE_VIDEO_I2V_MODEL',
          'REPLICATE_VIDEO_I2V_PREMIUM',
          'wavespeedai/wan-2.1-i2v-480p',
        );
      case ReplicateUseCase.VideoRemix:
        return pick(
          'REPLICATE_VIDEO_REMIX_MODEL',
          'REPLICATE_VIDEO_REMIX_PREMIUM',
          'kwaivgi/kling-v3-video',
        );
      case ReplicateUseCase.CharacterGenerate:
        return pick(
          'REPLICATE_CHARACTER_IMAGE_MODEL',
          'REPLICATE_CHARACTER_IMAGE_MODEL_PREMIUM',
          'black-forest-labs/flux-schnell',
        );
      case ReplicateUseCase.ImageGenerate:
      case ReplicateUseCase.PhotosScriptImage:
        return pick(
          'REPLICATE_IMAGE_MODEL',
          'REPLICATE_IMAGE_MODEL_PREMIUM',
          'black-forest-labs/flux-schnell',
        );
      default:
        return 'black-forest-labs/flux-schnell';
    }
  }

  /** Wan models are silent; use Kling when audio is requested. */
  wantsVideoAudio(): boolean {
    const raw =
      this.config.get<string>('REPLICATE_VIDEO_GENERATE_AUDIO') ??
      this.config.get<string>('REPLICATE_KLING_GENERATE_AUDIO') ??
      'true';
    return raw === 'true';
  }

  /** Max concurrent Replicate video jobs (long multi-segment renders). */
  getVideoMaxParallel(): number {
    const n = Number(
      this.config.get<string>('REPLICATE_VIDEO_MAX_PARALLEL', '3'),
    );
    return Number.isFinite(n) && n > 0 ? Math.min(6, Math.floor(n)) : 3;
  }

  /** Hard ceiling for total generated video duration (all segments combined). */
  getMaxVideoSeconds(): number {
    const n = Number(
      this.config.get<string>('REPLICATE_MAX_VIDEO_SECONDS', '60'),
    );
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
  }

  /** Target total duration per videoLength tier (capped by REPLICATE_MAX_VIDEO_SECONDS). */
  getTierTargetSeconds(videoLength: VideoLengthTier): number {
    const cap = this.getMaxVideoSeconds();
    const envByTier: Record<VideoLengthTier, string> = {
      short: 'REPLICATE_SHORT_VIDEO_SECONDS',
      medium: 'REPLICATE_MEDIUM_VIDEO_SECONDS',
      long: 'REPLICATE_LONG_VIDEO_TARGET_SECONDS',
    };
    const defaultByTier: Record<VideoLengthTier, number> = {
      short: 20,
      medium: 40,
      long: 60,
    };
    const raw = Number(
      this.config.get<string>(envByTier[videoLength]) ??
        String(defaultByTier[videoLength]),
    );
    const target = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : defaultByTier[videoLength];
    return Math.min(target, cap);
  }

  getVideoSegmentConfig(videoLength: VideoLengthTier = 'short'): {
    segmentCount: number;
    secondsPerSegment: number;
  } {
    const targetSeconds = this.getTierTargetSeconds(videoLength);
    const maxSeconds = Number(
      this.config.get<string>('REPLICATE_SEGMENT_MAX_SECONDS', '15'),
    );
    const maxSegments = Number(
      this.config.get<string>('REPLICATE_LONG_VIDEO_MAX_SEGMENTS', '4'),
    );
    const segmentCap = Math.max(
      1,
      Math.floor(this.getMaxVideoSeconds() / maxSeconds),
    );
    const segmentCount = Math.min(
      maxSegments,
      segmentCap,
      Math.max(1, Math.ceil(targetSeconds / maxSeconds)),
    );
    const secondsPerSegment = Math.min(
      maxSeconds,
      Math.max(3, Math.ceil(targetSeconds / segmentCount)),
    );
    return { segmentCount, secondsPerSegment };
  }

  resolveVideoModel(useCase: ReplicateUseCase): string {
    const model = this.resolveModel(useCase);
    if (!this.wantsVideoAudio() || this.isKlingFamily(model)) {
      return model;
    }
    const isImageToVideo =
      useCase === ReplicateUseCase.YoutubeRepurpose ||
      useCase === ReplicateUseCase.PhotosScriptVideo;
    if (isImageToVideo) {
      return (
        this.config.get<string>('REPLICATE_VIDEO_I2V_PREMIUM') ??
        'kwaivgi/kling-v3-video'
      );
    }
    return (
      this.config.get<string>('REPLICATE_VIDEO_T2V_PREMIUM') ??
      'kwaivgi/kling-v3-video'
    );
  }

  buildTextToVideoPlan(
    prompt: string,
    opts?: {
      aspectRatio?: string;
      videoLength?: VideoLengthTier;
      durationSeconds?: number;
    },
  ): ReplicateRunPlan {
    const model = this.resolveVideoModel(ReplicateUseCase.TextToVideo);
    const segmentSeconds =
      opts?.durationSeconds ?? this.getSegmentSeconds(opts?.videoLength);
    return {
      model,
      input: this.buildVideoInput(model, prompt, {
        ...opts,
        durationSeconds: segmentSeconds,
      }),
      timeoutMs: 300_000,
    };
  }

  buildFacelessVideoPlan(
    prompt: string,
    opts: {
      aspectRatio: string;
      videoLength?: VideoLengthTier;
      durationSeconds?: number;
    },
  ): ReplicateRunPlan {
    const model = this.resolveVideoModel(ReplicateUseCase.FacelessVideo);
    const segmentSeconds =
      opts.durationSeconds ?? this.getSegmentSeconds(opts.videoLength);
    return {
      model,
      input: this.buildVideoInput(model, prompt, {
        aspectRatio: opts.aspectRatio,
        videoLength: opts.videoLength,
        durationSeconds: segmentSeconds,
      }),
      timeoutMs: 300_000,
    };
  }

  buildYoutubeRepurposePlans(
    prompt: string,
    opts: {
      youtubeUrl: string;
      startImageUrl?: string;
      videoLength?: VideoLengthTier;
    },
  ): ReplicateRunPlan[] {
    const plans: ReplicateRunPlan[] = [];

    if (opts.startImageUrl) {
      plans.push(this.buildImageToVideoPlan(prompt, opts.startImageUrl, opts));
    }

    const t2vModel = this.resolveVideoModel(ReplicateUseCase.TextToVideo);
    plans.push({
      model: t2vModel,
      input: this.buildVideoInput(t2vModel, prompt, {
        videoLength: opts.videoLength,
        durationSeconds: this.getSegmentSeconds(opts.videoLength),
      }),
      timeoutMs: 300_000,
    });

    return plans;
  }

  buildImageToVideoPlan(
    prompt: string,
    imageUrl: string,
    opts?: {
      videoLength?: VideoLengthTier;
      aspectRatio?: string;
      useCase?: ReplicateUseCase.YoutubeRepurpose | ReplicateUseCase.PhotosScriptVideo;
      durationSeconds?: number;
    },
  ): ReplicateRunPlan {
    const useCase = opts?.useCase ?? ReplicateUseCase.YoutubeRepurpose;
    const model = this.resolveVideoModel(useCase);
    const seconds =
      opts?.durationSeconds ?? this.getSegmentSeconds(opts?.videoLength);
    const input = this.buildImageToVideoInput(model, prompt, imageUrl, {
      ...opts,
      durationSeconds: seconds,
    });
    return { model, input, timeoutMs: 300_000 };
  }

  buildRemixPlan(
    prompt: string,
    opts: { sourceVideoUrl: string; startImageUrl?: string },
  ): ReplicateRunPlan[] {
    const remixModel = this.resolveModel(ReplicateUseCase.VideoRemix);
    const plans: ReplicateRunPlan[] = [];

    if (this.isKlingFamily(remixModel)) {
      plans.push({
        model: remixModel,
        input: {
          prompt: this.localizeVideoPrompt(prompt),
          ...(opts.startImageUrl
            ? { start_image: opts.startImageUrl }
            : {}),
          aspect_ratio: '16:9',
          duration: 8,
          mode: 'standard',
          generate_audio: this.wantsVideoAudio(),
        },
        timeoutMs: 300_000,
      });
    } else {
      plans.push({
        model: remixModel,
        input: {
          prompt: this.localizeVideoPrompt(prompt),
          video: opts.sourceVideoUrl,
        },
        timeoutMs: 300_000,
      });
    }

    if (opts.startImageUrl) {
      plans.push(
        this.buildImageToVideoPlan(prompt, opts.startImageUrl, {
          videoLength: 'medium',
        }),
      );
    }

    return plans;
  }

  buildImagePlan(
    useCase: ReplicateUseCase.ImageGenerate | ReplicateUseCase.PhotosScriptImage | ReplicateUseCase.CharacterGenerate,
    prompt: string,
    opts?: { imageUrl?: string; aspectRatio?: string },
  ): ReplicateRunPlan {
    const model = this.resolveModel(useCase);
    const input: Record<string, unknown> = { prompt };

    if (opts?.aspectRatio && this.isFluxFamily(model)) {
      input.aspect_ratio = this.mapAspectRatio(opts.aspectRatio);
    }

    const useImageInput =
      this.config.get<string>('REPLICATE_PHOTOS_SCRIPT_IMAGE_INPUT', 'true') !==
      'false';
    if (opts?.imageUrl && useImageInput) {
      if (this.isFluxFamily(model)) {
        input.image = opts.imageUrl;
      } else {
        input.input_image = opts.imageUrl;
      }
    }

    return { model, input, timeoutMs: 180_000 };
  }

  private buildVideoInput(
    model: string,
    prompt: string,
    opts?: {
      aspectRatio?: string;
      videoLength?: VideoLengthTier;
      durationSeconds?: number;
    },
  ): Record<string, unknown> {
    const localizedPrompt = this.localizeVideoPrompt(prompt);
    if (this.isKlingFamily(model)) {
      const duration =
        opts?.durationSeconds ??
        this.getSegmentSeconds(opts?.videoLength ?? 'short');
      return {
        prompt: localizedPrompt,
        aspect_ratio: this.mapAspectRatio(opts?.aspectRatio ?? '16:9'),
        duration: Math.min(15, Math.max(3, duration)),
        mode: 'standard',
        generate_audio: this.wantsVideoAudio(),
      };
    }

    if (this.isWanT2vFamily(model)) {
      const input: Record<string, unknown> = { prompt: localizedPrompt };
      if (opts?.aspectRatio) {
        input.aspect_ratio = this.mapAspectRatio(opts.aspectRatio);
      }
      return input;
    }

    return { prompt: localizedPrompt };
  }

  private buildImageToVideoInput(
    model: string,
    prompt: string,
    imageUrl: string,
    opts?: {
      videoLength?: VideoLengthTier;
      aspectRatio?: string;
      durationSeconds?: number;
    },
  ): Record<string, unknown> {
    const localizedPrompt = this.localizeVideoPrompt(prompt);
    if (this.isKlingFamily(model)) {
      const duration =
        opts?.durationSeconds ??
        this.getSegmentSeconds(opts?.videoLength ?? 'short');
      return {
        prompt: localizedPrompt,
        start_image: imageUrl,
        aspect_ratio: this.mapAspectRatio(opts?.aspectRatio ?? '9:16'),
        duration: Math.min(15, Math.max(3, duration)),
        mode: 'standard',
        generate_audio: this.wantsVideoAudio(),
      };
    }

    if (this.isWanI2vFamily(model)) {
      return {
        prompt: localizedPrompt,
        image: imageUrl,
        ...(opts?.aspectRatio
          ? { aspect_ratio: this.mapAspectRatio(opts.aspectRatio) }
          : {}),
      };
    }

    return { prompt: localizedPrompt, image: imageUrl };
  }

  private isKlingFamily(model: string): boolean {
    return model.includes('kling');
  }

  private isWanT2vFamily(model: string): boolean {
    return model.includes('wan') && model.includes('t2v');
  }

  private isWanI2vFamily(model: string): boolean {
    return model.includes('wan') && model.includes('i2v');
  }

  private isFluxFamily(model: string): boolean {
    return model.includes('flux');
  }

  private mapAspectRatio(ratio: string): string {
    const normalized = ratio.replace(/\s/g, '');
    if (normalized === '9:16' || normalized.includes('9:16')) return '9:16';
    if (normalized === '1:1' || normalized.includes('1:1')) return '1:1';
    return '16:9';
  }

  private getSegmentSeconds(videoLength?: VideoLengthTier): number {
    return this.getVideoSegmentConfig(videoLength).secondsPerSegment;
  }
}
