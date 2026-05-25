import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { VideoGenerationQueueService } from '../queue/video-generation-queue.service';
import { CreationMode } from './dto/create-video-project.dto';
import { VideoProjectStatus } from './dto/list-video-projects.dto';
import {
  VideoProject,
  VideoProjectDocument,
} from './schemas/video-project.schema';

@Injectable()
export class VideoStudioGenerationService {
  private readonly logger = new Logger(VideoStudioGenerationService.name);

  constructor(
    @InjectModel(VideoProject.name)
    private readonly projectModel: Model<VideoProjectDocument>,
    private readonly aiService: AiService,
    private readonly videoQueue: VideoGenerationQueueService,
  ) {}

  /** Enqueue durable job, or run in-process when REDIS_URL is unset. */
  scheduleProjectGeneration(projectId: string, userId: string): void {
    if (this.videoQueue.isQueueEnabled()) {
      void this.videoQueue.enqueue({ projectId, userId }).catch((err: unknown) => {
        this.logger.error(
          `Failed to enqueue project ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      return;
    }
    void this.executeProjectGeneration(projectId, userId).catch((err: unknown) => {
      this.logger.error(
        `Generation failed for project ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /** Called by BullMQ worker or in-process fallback. */
  async executeProjectGeneration(
    projectId: string,
    userId: string,
  ): Promise<void> {
    await this.run(projectId, userId);
  }

  private async run(projectId: string, userId: string): Promise<void> {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project || project.userId !== userId) {
      return;
    }

    await this.projectModel
      .updateOne({ _id: projectId }, { $set: { progress: 20 } })
      .exec();

    try {
      if (project.mode === CreationMode.PhotosScript) {
        const out = await this.aiService.studioPhotosScript(userId, {
          photos: project.photos ?? [],
          script: project.script ?? '',
          videoLength: project.videoLength,
        });
        await this.projectModel
          .updateOne(
            { _id: projectId },
            {
              $set: {
                status: VideoProjectStatus.Completed,
                progress: 100,
                thumbnailUrl: out.thumbnailUrl ?? out.secureUrl ?? null,
                outputVideoUrl: out.isVideo ? (out.secureUrl ?? null) : null,
                outputVideoUrls:
                  out.isVideo && 'outputVideoUrls' in out
                    ? (out.outputVideoUrls ?? [])
                    : [],
                hasAudio:
                  out.isVideo && 'hasAudio' in out ? Boolean(out.hasAudio) : false,
                durationSeconds: out.durationSeconds,
              },
            },
          )
          .exec();
        return;
      }

      const onProgress = async (progress: number) => {
        await this.projectModel
          .updateOne({ _id: projectId }, { $set: { progress } })
          .exec();
      };

      let out: {
        secureUrl: string | null;
        durationSeconds?: number;
        outputVideoUrls?: string[];
        hasAudio?: boolean;
      };
      switch (project.mode) {
        case CreationMode.TextToVideo:
          out = await this.aiService.studioTextToVideo(userId, {
            prompt: project.prompt ?? '',
            voiceStyle: project.voiceStyle ?? 'professional_male',
            visualStyle: project.visualStyle ?? 'cinematic',
            videoLength: project.videoLength,
            onProgress,
          });
          break;
        case CreationMode.FacelessVideo:
          out = await this.aiService.studioFacelessVideo(userId, {
            topic: project.topic ?? '',
            niche: project.niche ?? 'finance',
            aspectRatio: project.aspectRatio ?? '9:16',
            videoLength: project.videoLength,
            onProgress,
          });
          break;
        case CreationMode.YoutubeRepurpose:
          out = await this.aiService.studioYoutubeRepurpose(userId, {
            youtubeUrl: project.youtubeUrl ?? '',
            customScript: project.customScript,
            additionalPhotos: project.additionalPhotos ?? [],
            videoLength: project.videoLength,
            onProgress,
          });
          break;
        default:
          await this.projectModel
            .updateOne(
              { _id: projectId },
              { $set: { status: VideoProjectStatus.Failed, progress: 0 } },
            )
            .exec();
          return;
      }

      await this.projectModel
        .updateOne(
          { _id: projectId },
          {
            $set: {
              status: VideoProjectStatus.Completed,
              progress: 100,
              outputVideoUrl: out.secureUrl ?? null,
              outputVideoUrls: out.outputVideoUrls ?? [],
              hasAudio: out.hasAudio ?? false,
              thumbnailUrl: out.secureUrl ?? null,
              durationSeconds: out.durationSeconds,
            },
          },
        )
        .exec();
    } catch (err: unknown) {
      this.logger.error(
        `Project ${projectId} generation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.projectModel
        .updateOne(
          { _id: projectId },
          { $set: { status: VideoProjectStatus.Failed, progress: 0 } },
        )
        .exec();
    }
  }
}
