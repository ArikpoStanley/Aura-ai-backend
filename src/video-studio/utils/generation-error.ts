import { ProviderError } from '../../ai/utils/provider-error';

export type GenerationFailure = {
  code: string;
  reason: string;
  retryable: boolean;
  provider?: string;
  providerJobId?: string;
  rawMessage?: string;
};

export function classifyGenerationFailure(err: unknown): GenerationFailure {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const message = rawMessage.trim() || 'Video generation failed unexpectedly.';
  const lower = message.toLowerCase();
  const provider =
    err instanceof ProviderError ? err.provider : undefined;
  const providerJobId =
    err instanceof ProviderError ? err.providerJobId : undefined;
  const rawProviderMessage =
    err instanceof ProviderError ? JSON.stringify(err.raw ?? null) : undefined;

  if (lower.includes('moderation') || lower.includes('blocked by our moderation system')) {
    return {
      code: 'OPENAI_MODERATION_BLOCKED',
      reason:
        'OpenAI blocked this prompt during video generation. Try removing sensitive religious, political, violent, sexual, celebrity, real-person, logo, or readable-text details, then generate again.',
      retryable: false,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  if (lower.includes('openai_api_key') || lower.includes('api key')) {
    return {
      code: 'OPENAI_CONFIGURATION_ERROR',
      reason:
        'OpenAI is not configured correctly on the server. Check OPENAI_API_KEY and deployed environment variables.',
      retryable: false,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      code: 'GENERATION_TIMEOUT',
      reason:
        'OpenAI video generation is taking longer than expected. The job may succeed if retried; if it keeps failing, use a shorter prompt or shorter video length.',
      retryable: true,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  if (lower.includes('rate limit') || lower.includes('429')) {
    return {
      code: 'PROVIDER_RATE_LIMITED',
      reason:
        'The video provider is temporarily rate limited. Please wait a few minutes and try again.',
      retryable: true,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  if (lower.includes('ffmpeg')) {
    return {
      code: 'VIDEO_RENDER_ERROR',
      reason:
        'The clips were generated but final video rendering failed. Check that FFmpeg is installed and available on the worker.',
      retryable: true,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  if (lower.includes('cloudinary')) {
    return {
      code: 'MEDIA_UPLOAD_ERROR',
      reason:
        'The video was generated but upload failed. Check Cloudinary configuration and try again.',
      retryable: true,
      provider,
      providerJobId,
      rawMessage: rawProviderMessage ?? message,
    };
  }

  return {
    code: 'VIDEO_GENERATION_FAILED',
    reason: message,
    retryable: true,
    provider,
    providerJobId,
    rawMessage: rawProviderMessage ?? message,
  };
}
