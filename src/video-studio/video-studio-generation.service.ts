import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
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
  ) {}

  /** Fire-and-forget: runs Replicate + Cloudinary after project row exists. */
  scheduleProjectGeneration(projectId: string, userId: string): void {
    void this.run(projectId, userId).catch((err: unknown) => {
      this.logger.error(
        `Generation failed for project ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
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
        const out = await this.aiService.studioPhotosScriptImage(userId, {
          photos: project.photos ?? [],
          script: project.script ?? '',
        });
        await this.projectModel
          .updateOne(
            { _id: projectId },
            {
              $set: {
                status: VideoProjectStatus.Completed,
                progress: 100,
                thumbnailUrl: out.secureUrl ?? null,
                outputVideoUrl: null,
              },
              $unset: { durationSeconds: '' },
            },
          )
          .exec();
        return;
      }

      let out: { secureUrl: string | null; durationSeconds?: number };
      switch (project.mode) {
        case CreationMode.TextToVideo:
          out = await this.aiService.studioTextToVideo(userId, {
            prompt: project.prompt ?? '',
            voiceStyle: project.voiceStyle ?? 'professional_male',
            visualStyle: project.visualStyle ?? 'cinematic',
          });
          break;
        case CreationMode.FacelessVideo:
          out = await this.aiService.studioFacelessVideo(userId, {
            topic: project.topic ?? '',
            niche: project.niche ?? 'finance',
            aspectRatio: project.aspectRatio ?? '9:16',
          });
          break;
        case CreationMode.YoutubeRepurpose:
          out = await this.aiService.studioYoutubeRepurpose(userId, {
            youtubeUrl: project.youtubeUrl ?? '',
            customScript: project.customScript,
            additionalPhotos: project.additionalPhotos ?? [],
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
              thumbnailUrl: out.secureUrl ?? null,
              durationSeconds: out.durationSeconds,
            },
          },
        )
        .exec();
    } catch {
      await this.projectModel
        .updateOne(
          { _id: projectId },
          { $set: { status: VideoProjectStatus.Failed, progress: 0 } },
        )
        .exec();
    }
  }
}
