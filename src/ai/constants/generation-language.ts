/** Default locale for prompts, dialogue, and on-screen text in generated media. */
export const DEFAULT_GENERATION_LANGUAGE = 'en';

export const ENGLISH_OPENAI_DIRECTIVES = [
  'Default language: English (United States).',
  'All dialogue, voiceover, narration, captions, and on-screen text you describe must be in English only.',
  'Do not include other languages unless the user idea explicitly requires a specific non-English language.',
].join(' ');

const ENGLISH_VIDEO_SUFFIX =
  ' All spoken dialogue, voiceover, narration, and visible text must be in English (US). No other languages.';

const ENGLISH_IMAGE_SUFFIX =
  ' Any visible text in the image must be in English (US).';

export function isEnglishLanguage(code?: string): boolean {
  const normalized = (code ?? DEFAULT_GENERATION_LANGUAGE).trim().toLowerCase();
  return (
    normalized === 'en' ||
    normalized === 'en-us' ||
    normalized === 'english' ||
    normalized.startsWith('english')
  );
}

export function applyEnglishVideoPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.toLowerCase().includes('english (us)')) {
    return trimmed;
  }
  return `${trimmed}${ENGLISH_VIDEO_SUFFIX}`;
}

export function applyEnglishImagePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.toLowerCase().includes('english (us)')) {
    return trimmed;
  }
  return `${trimmed}${ENGLISH_IMAGE_SUFFIX}`;
}
