export const CREATION_MODES = [
  {
    id: 'text_to_video',
    label: 'Text to video',
    description: 'Turn a written prompt into a narrated video',
  },
  {
    id: 'photos_script',
    label: 'Photos + script',
    description: 'Upload photos and provide narration',
  },
  {
    id: 'youtube_repurpose',
    label: 'YouTube repurpose',
    description: 'Repurpose a YouTube link into short-form content',
  },
  {
    id: 'faceless_video',
    label: 'Faceless video',
    description: 'Generate niche faceless videos from a concept',
  },
] as const;

export const VIDEO_LENGTHS = [
  { id: 'short', label: 'Short (15-60s)' },
  { id: 'medium', label: 'Medium (1-3m)' },
  { id: 'long', label: 'Long (3-10m)' },
] as const;

export const VOICE_STYLES = [
  { id: 'professional_male', label: 'Professional male' },
  { id: 'professional_female', label: 'Professional female' },
  { id: 'casual_upbeat', label: 'Casual upbeat' },
  { id: 'documentary', label: 'Documentary' },
] as const;

export const VISUAL_STYLES = [
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'vibrant', label: 'Vibrant' },
  { id: 'news_style', label: 'News-style' },
] as const;

export const NICHES = [
  { id: 'finance', label: 'Finance' },
  { id: 'motivation', label: 'Motivation' },
  { id: 'tech', label: 'Tech' },
  { id: 'health', label: 'Health' },
  { id: 'lifestyle', label: 'Lifestyle' },
] as const;

export const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16 (Reels/TikTok)' },
  { id: '16:9', label: '16:9 (YouTube)' },
  { id: '1:1', label: '1:1 (Square)' },
] as const;
