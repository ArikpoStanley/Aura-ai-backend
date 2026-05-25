import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ENGLISH_OPENAI_DIRECTIVES,
  isEnglishLanguage,
} from '../constants/generation-language';

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;
  private readonly model: string;

  private readonly useEnglish: boolean;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    this.useEnglish = isEnglishLanguage(
      this.config.get<string>('GENERATION_DEFAULT_LANGUAGE'),
    );
  }

  private withLanguageRules(lines: string[]): string {
    if (!this.useEnglish) {
      return lines.join('\n');
    }
    return [ENGLISH_OPENAI_DIRECTIVES, ...lines].join('\n');
  }

  async generateVideoPrompt(input: {
    idea: string;
    tone?: string;
    style?: string;
    targetAudience?: string;
  }): Promise<string> {
    const userPrompt = this.withLanguageRules([
      'You are a creative prompt engineer for AI image/video generation.',
      'Generate a single production-ready prompt.',
      'Keep it concise and vivid.',
      `Idea: ${input.idea}`,
      `Tone: ${input.tone ?? 'confident'}`,
      `Style: ${input.style ?? 'cinematic'}`,
      `Target audience: ${input.targetAudience ?? 'general'}`,
      'Return only the final prompt text.',
    ]);

    return this.complete(userPrompt, 0.7, input.idea);
  }

  async generateCharacterPrompt(input: {
    name: string;
    description: string;
    style?: string;
    mood?: string;
  }): Promise<string> {
    const userPrompt = this.withLanguageRules([
      'Create one high-quality image generation prompt for a character portrait.',
      'Output one paragraph only, no markdown, no labels.',
      `Character name: ${input.name}`,
      `Description: ${input.description}`,
      `Art style: ${input.style ?? 'semi-realistic cinematic concept art'}`,
      `Mood: ${input.mood ?? 'confident and expressive'}`,
      'Include appearance, outfit, lighting, background, camera framing details.',
    ]);

    return this.complete(userPrompt, 0.8, input.description);
  }

  /** Split a concept into N sequential scene prompts for multi-clip long videos. */
  async generateVideoScenePrompts(input: {
    idea: string;
    segmentCount: number;
    secondsPerSegment: number;
    tone?: string;
    style?: string;
  }): Promise<string[]> {
    const userPrompt = this.withLanguageRules([
      `Split this video concept into exactly ${input.segmentCount} sequential scenes.`,
      `Each scene is about ${input.secondsPerSegment} seconds of screen time.`,
      'Return ONLY a JSON array of strings, one prompt per scene, no markdown.',
      'Keep narrative continuity across scenes.',
      'Every scene prompt must specify English-only dialogue and on-screen text.',
      `Concept: ${input.idea}`,
      `Tone: ${input.tone ?? 'confident'}`,
      `Style: ${input.style ?? 'cinematic'}`,
    ]);

    const raw = await this.complete(userPrompt, 0.6, input.idea);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const scenes = parsed
          .filter((item): item is string => typeof item === 'string')
          .map((s) => s.trim())
          .filter(Boolean);
        if (scenes.length > 0) {
          return scenes.slice(0, input.segmentCount);
        }
      }
    } catch {
      /* fall through */
    }

    return Array.from({ length: input.segmentCount }, (_, i) => {
      const base = `${input.idea}. Scene ${i + 1} of ${input.segmentCount}, ${input.style ?? 'cinematic'} style.`;
      return this.useEnglish
        ? `${base} English dialogue and on-screen text only.`
        : base;
    });
  }

  /** Scenes for hybrid pipeline: narration line + stock-video search query per scene. */
  async generateHybridScenes(input: {
    idea: string;
    sceneCount: number;
    secondsPerScene: number;
    tone?: string;
  }): Promise<Array<{ narration: string; searchQuery: string; caption: string }>> {
    const userPrompt = this.withLanguageRules([
      `Create exactly ${input.sceneCount} scenes for a short-form video.`,
      `Each scene is ~${input.secondsPerScene} seconds.`,
      'Return ONLY a JSON array of objects with keys: narration, searchQuery, caption.',
      'narration: one spoken English sentence for voiceover.',
      'searchQuery: 2-5 English words for stock video search; avoid text, signs, logos, documents, screens, and writing.',
      'caption: short English on-screen text (max 8 words).',
      'Do not use any non-English words.',
      `Concept: ${input.idea}`,
      `Tone: ${input.tone ?? 'engaging'}`,
    ]);

    const raw = await this.complete(userPrompt, 0.5, input.idea);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const scenes = parsed
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .map((item) => ({
            narration: this.ensureEnglishCue(
              String(item.narration ?? '').trim(),
              input.idea,
            ),
            searchQuery: this.ensureEnglishCue(
              String(item.searchQuery ?? item.search_query ?? 'abstract').trim(),
              'cinematic b-roll no text',
            ),
            caption: this.ensureEnglishCue(
              String(item.caption ?? '').trim(),
              'Keep moving',
            ),
          }))
          .filter((s) => s.narration || s.searchQuery);
        if (scenes.length > 0) {
          return scenes.slice(0, input.sceneCount);
        }
      }
    } catch {
      /* fall through */
    }

    return Array.from({ length: input.sceneCount }, (_, i) => ({
      narration: `${input.idea}. Scene ${i + 1}.`,
      searchQuery: 'cinematic b-roll no text',
      caption: `Scene ${i + 1}`,
    }));
  }

  private ensureEnglishCue(value: string, fallback: string): string {
    const text = value.trim();
    if (!text || /[^\u0000-\u007F]/.test(text)) {
      return fallback;
    }
    return text;
  }

  private async complete(
    userPrompt: string,
    temperature: number,
    fallback: string,
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 350,
      temperature,
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text || fallback;
  }
}
