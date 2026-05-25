export type VideoGenerationRequest = {
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  imageUrl?: string;
};

export type VideoGenerationResult = {
  outputUrls: string[];
  model: string;
  provider: string;
};

export interface MediaGenerationProvider {
  readonly name: string;
  generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}
