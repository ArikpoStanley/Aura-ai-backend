import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ASPECT_RATIOS,
  CREATION_MODES,
  NICHES,
  VIDEO_LENGTHS,
  VISUAL_STYLES,
  VOICE_STYLES,
} from './constants/video-studio-options';
import {
  CreateVideoProjectDto,
  CreationMode,
} from './dto/create-video-project.dto';
import {
  CreateFacelessVideoDto,
  CreatePhotosScriptDto,
  CreateTextToVideoDto,
  CreateYoutubeRepurposeDto,
} from './dto/create-by-mode.dto';
import {
  ListVideoProjectsDto,
  VideoProjectStatus,
} from './dto/list-video-projects.dto';
import {
  VideoProject,
  VideoProjectDocument,
} from './schemas/video-project.schema';
import { VideoStudioGenerationService } from './video-studio-generation.service';

type DashboardStats = {
  videosCreated: number;
  minutesGenerated: number;
  creditsLeft: number;
};

@Injectable()
export class VideoStudioService {
  constructor(
    @InjectModel(VideoProject.name)
    private readonly projectModel: Model<VideoProjectDocument>,
    private readonly videoStudioGeneration: VideoStudioGenerationService,
  ) {}

  getCreationOptions() {
    return {
      creationModes: CREATION_MODES,
      dropdowns: {
        videoLengths: VIDEO_LENGTHS,
        voiceStyles: VOICE_STYLES,
        visualStyles: VISUAL_STYLES,
        niches: NICHES,
        aspectRatios: ASPECT_RATIOS,
      },
    };
  }

  async createProject(userId: string, dto: CreateVideoProjectDto) {
    this.validatePayloadByMode(dto);
    const title = dto.title?.trim() || this.fallbackTitle(dto);
    const project = await this.projectModel.create({
      userId,
      mode: dto.mode,
      title,
      videoLength: dto.videoLength,
      status: VideoProjectStatus.InProgress,
      progress: 5,
      // Keep a normalized copy of mode-specific payload.
      prompt: dto.prompt,
      voiceStyle: dto.voiceStyle,
      visualStyle: dto.visualStyle,
      photos: dto.photos ?? [],
      script: dto.script,
      youtubeUrl: dto.youtubeUrl,
      additionalPhotos: dto.additionalPhotos ?? [],
      customScript: dto.customScript,
      topic: dto.topic,
      niche: dto.niche,
      aspectRatio: dto.aspectRatio,
      failureRetryable: false,
    });
    this.videoStudioGeneration.scheduleProjectGeneration(
      project._id.toString(),
      userId,
    );
    return this.toProjectCard(project);
  }

  async createTextToVideo(userId: string, dto: CreateTextToVideoDto) {
    return this.createProject(userId, {
      mode: CreationMode.TextToVideo,
      ...dto,
    });
  }

  async createPhotosScript(userId: string, dto: CreatePhotosScriptDto) {
    return this.createProject(userId, {
      mode: CreationMode.PhotosScript,
      ...dto,
    });
  }

  async createYoutubeRepurpose(userId: string, dto: CreateYoutubeRepurposeDto) {
    return this.createProject(userId, {
      mode: CreationMode.YoutubeRepurpose,
      ...dto,
    });
  }

  async createFacelessVideo(userId: string, dto: CreateFacelessVideoDto) {
    return this.createProject(userId, {
      mode: CreationMode.FacelessVideo,
      ...dto,
    });
  }

  async listProjects(userId: string, query: ListVideoProjectsDto) {
    const limit = query.limit ?? 20;
    const filter: { userId: string; status?: VideoProjectStatus } = { userId };
    if (query.status) {
      filter.status = query.status;
    }
    const projects = await this.projectModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return projects.map((project) => this.toProjectCard(project));
  }

  async getDashboard(userId: string) {
    const [stats, recentVideos, inProgress] = await Promise.all([
      this.computeDashboardStats(userId),
      this.projectModel
        .find({ userId, status: VideoProjectStatus.Completed })
        .sort({ updatedAt: -1 })
        .limit(5)
        .exec(),
      this.projectModel
        .findOne({ userId, status: VideoProjectStatus.InProgress })
        .sort({ updatedAt: -1 })
        .exec(),
    ]);
    return {
      stats,
      recentVideos: recentVideos.map((project) => this.toProjectCard(project)),
      inProgress: inProgress ? this.toProjectCard(inProgress) : null,
    };
  }

  private async computeDashboardStats(userId: string): Promise<DashboardStats> {
    const [videosCreated, durationAgg] = await Promise.all([
      this.projectModel
        .countDocuments({ userId, status: VideoProjectStatus.Completed })
        .exec(),
      this.projectModel.aggregate<{ totalSeconds: number }>([
        { $match: { userId, status: VideoProjectStatus.Completed } },
        { $group: { _id: null, totalSeconds: { $sum: '$durationSeconds' } } },
      ]),
    ]);
    const totalSeconds = durationAgg[0]?.totalSeconds ?? 0;
    const minutesGenerated = Math.floor(totalSeconds / 60);
    return {
      videosCreated,
      minutesGenerated,
      creditsLeft: 8,
    };
  }

  private validatePayloadByMode(dto: CreateVideoProjectDto): void {
    const has = (value?: string | string[]) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
    const assert = (condition: boolean, message: string) => {
      if (!condition) {
        throw new BadRequestException(message);
      }
    };

    switch (dto.mode) {
      case CreationMode.TextToVideo:
        assert(has(dto.prompt), 'prompt is required for text_to_video');
        assert(
          Boolean(dto.voiceStyle),
          'voiceStyle is required for text_to_video',
        );
        assert(
          Boolean(dto.visualStyle),
          'visualStyle is required for text_to_video',
        );
        break;
      case CreationMode.PhotosScript:
        assert(has(dto.photos), 'photos is required for photos_script');
        assert(has(dto.script), 'script is required for photos_script');
        break;
      case CreationMode.YoutubeRepurpose:
        assert(
          has(dto.youtubeUrl),
          'youtubeUrl is required for youtube_repurpose',
        );
        break;
      case CreationMode.FacelessVideo:
        assert(has(dto.topic), 'topic is required for faceless_video');
        assert(Boolean(dto.niche), 'niche is required for faceless_video');
        assert(
          Boolean(dto.aspectRatio),
          'aspectRatio is required for faceless_video',
        );
        break;
      default:
        throw new BadRequestException('Unsupported mode');
    }
  }

  private fallbackTitle(dto: CreateVideoProjectDto): string {
    if (dto.mode === CreationMode.TextToVideo) {
      return dto.prompt?.slice(0, 40) ?? 'Text to video project';
    }
    if (dto.mode === CreationMode.PhotosScript) {
      return 'Photos + script project';
    }
    if (dto.mode === CreationMode.YoutubeRepurpose) {
      return 'YouTube repurpose project';
    }
    if (dto.mode === CreationMode.FacelessVideo) {
      return dto.topic?.slice(0, 40) ?? 'Faceless video project';
    }
    return 'Video project';
  }

  private toProjectCard(project: VideoProjectDocument) {
    return {
      id: project._id.toString(),
      mode: project.mode,
      title: project.title,
      status: project.status,
      progress: project.progress,
      videoLength: project.videoLength,
      durationSeconds: project.durationSeconds ?? null,
      thumbnailUrl: project.thumbnailUrl ?? null,
      outputVideoUrl: project.outputVideoUrl ?? null,
      outputVideoUrls: project.outputVideoUrls ?? [],
      hasAudio: project.hasAudio ?? false,
      failureCode: project.failureCode ?? null,
      failureReason: project.failureReason ?? null,
      failureRetryable: project.failureRetryable ?? false,
      failureProvider: project.failureProvider ?? null,
      failureProviderJobId: project.failureProviderJobId ?? null,
      failureRawMessage: project.failureRawMessage ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
