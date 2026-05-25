export type NarrationResult = {
  filePath: string;
  durationSeconds?: number;
};

export interface TextToSpeechProvider {
  readonly name: string;
  synthesizeNarration(text: string, voice?: string): Promise<NarrationResult>;
}
