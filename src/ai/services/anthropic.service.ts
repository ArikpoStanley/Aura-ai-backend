import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AnthropicService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>(
      'ANTHROPIC_MODEL',
      'claude-3-5-sonnet-latest',
    );
  }

  async generateVideoPrompt(input: {
    idea: string;
    tone?: string;
    style?: string;
    targetAudience?: string;
  }): Promise<string> {
    const prompt = [
      'You are a creative prompt engineer for AI image/video generation.',
      'Generate a single production-ready prompt.',
      'Keep it concise and vivid.',
      `Idea: ${input.idea}`,
      `Tone: ${input.tone ?? 'confident'}`,
      `Style: ${input.style ?? 'cinematic'}`,
      `Target audience: ${input.targetAudience ?? 'general'}`,
      'Return only the final prompt text.',
    ].join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 350,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((item) => item.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text.trim() : input.idea;
  }

  async generateCharacterPrompt(input: {
    name: string;
    description: string;
    style?: string;
    mood?: string;
  }): Promise<string> {
    const prompt = [
      'Create one high-quality image generation prompt for a character portrait.',
      'Output one paragraph only, no markdown, no labels.',
      `Character name: ${input.name}`,
      `Description: ${input.description}`,
      `Art style: ${input.style ?? 'semi-realistic cinematic concept art'}`,
      `Mood: ${input.mood ?? 'confident and expressive'}`,
      'Include appearance, outfit, lighting, background, camera framing details.',
    ].join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 350,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((item) => item.type === 'text');
    return textBlock?.type === 'text'
      ? textBlock.text.trim()
      : input.description;
  }
}
