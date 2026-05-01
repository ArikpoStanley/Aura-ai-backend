import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MediaAssetDocument = HydratedDocument<MediaAsset>;

@Schema({ timestamps: true })
export class MediaAsset {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['image', 'audio', 'video'], index: true })
  type: 'image' | 'audio' | 'video';

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ required: true })
  url: string;

  createdAt: Date;
  updatedAt: Date;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
