export type SceneClipInput = {
  filePath: string;
  durationSeconds: number;
  caption?: string;
};

export type ComposeVideoInput = {
  scenes: SceneClipInput[];
  narrationPath?: string;
  aspectRatio: string;
  outputPath: string;
};

export type ComposeVideoResult = {
  outputPath: string;
  durationSeconds: number;
};

export interface VideoRenderer {
  readonly name: string;
  compose(input: ComposeVideoInput): Promise<ComposeVideoResult>;
  createKenBurnsFromImage(
    imageUrl: string,
    durationSeconds: number,
    aspectRatio: string,
    outputPath: string,
  ): Promise<ComposeVideoResult>;
}
