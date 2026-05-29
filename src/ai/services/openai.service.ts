import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ENGLISH_OPENAI_DIRECTIVES,
  isEnglishLanguage,
} from '../constants/generation-language';
import {
  makeSoraSafeBrollPrompt,
  sanitizeForVideoGeneration,
} from '../utils/moderation-safe-prompt';

const VIDEO_MODERATION_RULES = [
  'Follow OpenAI video safety rules.',
  'Avoid real people, celebrities, copyrighted characters, logos, weapons, gore, sexual content, and policy-sensitive content.',
];

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
    strictVisualSafety?: boolean;
  }): Promise<string[]> {
    const concept = input.strictVisualSafety
      ? makeSoraSafeBrollPrompt(input.idea)
      : input.idea;
    const userPrompt = this.withLanguageRules([
      ...VIDEO_MODERATION_RULES,
      `Split this video concept into exactly ${input.segmentCount} sequential scenes.`,
      `Each scene is about ${input.secondsPerSegment} seconds of screen time.`,
      'Return ONLY a JSON array of strings, one prompt per scene, no markdown.',
      'Keep narrative continuity across scenes.',
      'Every scene prompt must specify English-only dialogue and on-screen text.',
      `Concept: ${concept}`,
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
      const base = `${concept}. Scene ${i + 1} of ${input.segmentCount}, ${input.style ?? 'cinematic'} style.`;
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
    strictVisualSafety?: boolean;
  }): Promise<Array<{ narration: string; searchQuery: string; caption: string }>> {
    const concept = input.strictVisualSafety
      ? makeSoraSafeBrollPrompt(input.idea)
      : input.idea;
    const safetyRules = input.strictVisualSafety
      ? [
          ...VIDEO_MODERATION_RULES,
          'For Sora visual prompts, prefer object-only and environment-only b-roll. Avoid humanoids, wings, faces, title cards, captions, signs, and screens.',
        ]
      : VIDEO_MODERATION_RULES;
    const userPrompt = this.withLanguageRules([
      ...safetyRules,
      `Create exactly ${input.sceneCount} scenes for a short-form video.`,
      `Each scene is ~${input.secondsPerScene} seconds.`,
      'Return ONLY a JSON array of objects with keys: narration, searchQuery, caption.',
      'narration: one spoken English sentence for voiceover.',
      input.strictVisualSafety
        ? 'searchQuery: 2-6 English words describing only objects, environments, or tools. No people, no humanoids, no wings, no religious terms.'
        : 'searchQuery: 2-8 English words describing the visual subject, setting, and action.',
      'caption: short English phrase for UI only (max 8 words).',
      'Do not use any non-English words.',
      `Concept: ${concept}`,
      `Tone: ${input.tone ?? 'engaging'}`,
    ]);

    const raw = await this.complete(userPrompt, 0.5, input.idea);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const scenes = parsed
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .map((item) => ({
            narration: this.prepareVideoCue(
              String(item.narration ?? '').trim(),
              'A cinematic renovation unfolds step by step.',
              input.strictVisualSafety,
            ),
            searchQuery: this.prepareVideoCue(
              String(item.searchQuery ?? item.search_query ?? 'abstract').trim(),
              'wooden ship ocean cinematic',
              input.strictVisualSafety,
            ),
            caption: this.prepareVideoCue(
              String(item.caption ?? '').trim(),
              'Restoration in progress',
              input.strictVisualSafety,
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

    const safeIdea = input.strictVisualSafety
      ? sanitizeForVideoGeneration(input.idea)
      : input.idea;
    return Array.from({ length: input.sceneCount }, (_, i) => ({
      narration: `${safeIdea}. Scene ${i + 1}.`,
      searchQuery: 'wooden ship ocean cinematic',
      caption: `Scene ${i + 1}`,
    }));
  }

  private prepareVideoCue(
    value: string,
    fallback: string,
    strictVisualSafety?: boolean,
  ): string {
    const cue = this.ensureEnglishCue(value, fallback);
    return strictVisualSafety ? sanitizeForVideoGeneration(cue) : cue;
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
