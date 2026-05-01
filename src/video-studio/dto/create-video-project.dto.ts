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

export enum CreationMode {
  TextToVideo = 'text_to_video',
  PhotosScript = 'photos_script',
  YoutubeRepurpose = 'youtube_repurpose',
  FacelessVideo = 'faceless_video',
}

export enum VideoLength {
  Short = 'short',
  Medium = 'medium',
  Long = 'long',
}

export enum VoiceStyle {
  ProfessionalMale = 'professional_male',
  ProfessionalFemale = 'professional_female',
  CasualUpbeat = 'casual_upbeat',
  Documentary = 'documentary',
}

export enum VisualStyle {
  Cinematic = 'cinematic',
  Minimal = 'minimal',
  Vibrant = 'vibrant',
  NewsStyle = 'news_style',
}

export enum Niche {
  Finance = 'finance',
  Motivation = 'motivation',
  Tech = 'tech',
  Health = 'health',
  Lifestyle = 'lifestyle',
}

export enum AspectRatio {
  Vertical = '9:16',
  Horizontal = '16:9',
  Square = '1:1',
}

export class CreateVideoProjectDto {
  @IsEnum(CreationMode)
  mode: CreationMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsEnum(VideoLength)
  videoLength: VideoLength;

  // text_to_video
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsEnum(VoiceStyle)
  voiceStyle?: VoiceStyle;

  @IsOptional()
  @IsEnum(VisualStyle)
  visualStyle?: VisualStyle;

  // photos_script
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUrl({}, { each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  script?: string;

  // youtube_repurpose
  @IsOptional()
  @IsUrl()
  youtubeUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUrl({}, { each: true })
  additionalPhotos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customScript?: string;

  // faceless_video
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  topic?: string;

  @IsOptional()
  @IsEnum(Niche)
  niche?: Niche;

  @IsOptional()
  @IsEnum(AspectRatio)
  aspectRatio?: AspectRatio;
}
