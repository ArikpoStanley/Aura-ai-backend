import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AspectRatio,
  Niche,
  VideoLength,
  VisualStyle,
  VoiceStyle,
} from './create-video-project.dto';

export class CreateTextToVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt: string;

  @IsEnum(VoiceStyle)
  voiceStyle: VoiceStyle;

  @IsEnum(VisualStyle)
  visualStyle: VisualStyle;

  @IsEnum(VideoLength)
  videoLength: VideoLength;
}

export class CreatePhotosScriptDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsUrl({}, { each: true })
  photos: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  script: string;

  @IsEnum(VideoLength)
  videoLength: VideoLength;
}

export class CreateYoutubeRepurposeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsUrl()
  youtubeUrl: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUrl({}, { each: true })
  additionalPhotos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customScript?: string;

  @IsEnum(VideoLength)
  videoLength: VideoLength;
}

export class CreateFacelessVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  topic: string;

  @IsEnum(Niche)
  niche: Niche;

  @IsEnum(AspectRatio)
  aspectRatio: AspectRatio;

  @IsEnum(VideoLength)
  videoLength: VideoLength;
}
