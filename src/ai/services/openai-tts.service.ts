import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import OpenAI from 'openai';
import type {
  NarrationResult,
  TextToSpeechProvider,
} from '../providers/text-to-speech.provider';

@Injectable()
export class OpenAiTtsService implements TextToSpeechProvider {
  readonly name = 'openai-tts';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultVoice: string;
  private readonly tempDir: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_TTS_MODEL', 'tts-1');
    this.defaultVoice = this.config.get<string>('OPENAI_TTS_VOICE', 'alloy');
    this.tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  async synthesizeNarration(
    text: string,
    voice?: string,
  ): Promise<NarrationResult> {
    const trimmed = text.trim().slice(0, 4096);
    if (!trimmed) {
      throw new Error('Narration text is empty');
    }

    const filePath = path.join(this.tempDir, `narration-${Date.now()}.mp3`);
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: (voice ?? this.defaultVoice) as 'alloy',
      input: trimmed,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return { filePath };
  }
}
