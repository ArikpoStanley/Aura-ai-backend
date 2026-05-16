import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AspectRatio,
  CreationMode,
  Niche,
  VideoLength,
  VisualStyle,
  VoiceStyle,
} from '../dto/create-video-project.dto';
import { VideoProjectStatus } from '../dto/list-video-projects.dto';

export type VideoProjectDocument = HydratedDocument<VideoProject>;

@Schema({ timestamps: true })
export class VideoProject {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, enum: Object.values(CreationMode), index: true })
  mode: CreationMode;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, enum: Object.values(VideoLength) })
  videoLength: VideoLength;

  @Prop({
    required: true,
    enum: Object.values(VideoProjectStatus),
    default: VideoProjectStatus.InProgress,
    index: true,
  })
  status: VideoProjectStatus;

  @Prop({ min: 0, max: 100, default: 0 })
  progress: number;

  @Prop()
  durationSeconds?: number;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  outputVideoUrl?: string;

  /** Ordered segment URLs for long (`videoLength: long`) multi-clip renders. */
  @Prop({ type: [String], default: [] })
  outputVideoUrls: string[];

  @Prop({ default: false })
  hasAudio: boolean;

  @Prop({ enum: Object.values(VoiceStyle) })
  voiceStyle?: VoiceStyle;

  @Prop({ enum: Object.values(VisualStyle) })
  visualStyle?: VisualStyle;

  @Prop({ enum: Object.values(Niche) })
  niche?: Niche;

  @Prop({ enum: Object.values(AspectRatio) })
  aspectRatio?: AspectRatio;

  @Prop()
  prompt?: string;

  @Prop()
  topic?: string;

  @Prop()
  script?: string;

  @Prop()
  customScript?: string;

  @Prop()
  youtubeUrl?: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [String], default: [] })
  additionalPhotos: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const VideoProjectSchema = SchemaFactory.createForClass(VideoProject);
