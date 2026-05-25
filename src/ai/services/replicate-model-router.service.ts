import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoLengthTier } from '../constants/replicate-use-case';

@Injectable()
export class ReplicateModelRouterService {
  constructor(private readonly config: ConfigService) {}

  /** Hard ceiling for total generated video duration (all segments combined). */
  getMaxVideoSeconds(): number {
    const n = Number(this.config.get<string>('VIDEO_MAX_SECONDS', '30'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  }

  /** Target total duration per videoLength tier (capped by VIDEO_MAX_SECONDS). */
  getTierTargetSeconds(videoLength: VideoLengthTier): number {
    const cap = this.getMaxVideoSeconds();
    const envByTier: Record<VideoLengthTier, string> = {
      short: 'VIDEO_SHORT_SECONDS',
      medium: 'VIDEO_MEDIUM_SECONDS',
      long: 'VIDEO_LONG_SECONDS',
    };
    const defaultByTier: Record<VideoLengthTier, number> = {
      short: 10,
      medium: 20,
      long: 30,
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
    const maxSeconds = Number(this.config.get<string>('VIDEO_SEGMENT_MAX_SECONDS', '12'));
    const maxSegments = Number(this.config.get<string>('VIDEO_LONG_MAX_SEGMENTS', '3'));
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
}
