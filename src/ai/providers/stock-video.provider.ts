export type StockClip = {
  id: string;
  url: string;
  durationSeconds: number;
  width: number;
  height: number;
  /** Local path after download (required for FFmpeg). */
  filePath: string;
};

export interface StockVideoProvider {
  readonly name: string;
  searchAndDownloadClip(query: string, minDurationSeconds: number): Promise<StockClip | null>;
}
