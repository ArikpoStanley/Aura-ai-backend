/** Best-effort prompt cleanup to reduce OpenAI video moderation blocks. */
export function sanitizeForVideoGeneration(prompt: string): string {
  return prompt
    .replace(/https:\/\/chatgpt\.com\/s\/[^\s,.)]+/gi, '')
    .replace(
      /https?:\/\/(?![^\s,.)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s,.)]*)?)[^\s,.)]+/gi,
      '',
    )
    .replace(/\bNoah'?s Ark\b/gi, 'a large old wooden ship')
    .replace(/\bNoah'?s Wife\b/gi, 'a traveler')
    .replace(/\bNoah\b/gi, 'a traveler')
    .replace(/\bThe Dove\b/gi, 'a white bird')
    .replace(/\bclassical Renaissance angels?\b/gi, 'floating golden repair tools')
    .replace(/\bwinged artisans?\b/gi, 'floating golden repair tools')
    .replace(/\bangels?\b/gi, 'floating golden tools')
    .replace(/\bark\b/gi, 'wooden ship')
    .replace(/\bfeather(s)?\b/gi, 'white particle')
    .replace(/\brobe(s)?\b/gi, 'gold fabric')
    .replace(/\bchoir\b/gi, 'ambient music')
    .replace(/\bdivine\b/gi, 'luminous')
    .replace(/\bheavenly\b/gi, 'ethereal')
    .replace(/\bcelestial\b/gi, 'golden')
    .replace(/\bhalo(es)?\b/gi, 'soft golden rim light')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOpenAiModerationBlock(message: string): boolean {
  return /moderation|blocked by our moderation system/i.test(message);
}

const SORA_BLOCK_RISK_PATTERN =
  /\b(noah|ark|angel|wing|winged|artisan|human|person|people|face|wife|dove|feather|robe|choir|divine|heaven|heavenly|celestial|biblical|religious|screen|text|title|logo|celebrity|real people)\b/i;

const SAFE_RENOVATION_BROLL = [
  'Wide shot of a weathered wooden ship on calm ocean water, cinematic golden-hour lighting, no people, no animals, no text, no logos.',
  'Macro close-up of polished metal tools scraping barnacles from old dark wood, ASMR detail, shallow depth of field, no people, no text, no logos.',
  'Close-up of an orbital sander smoothing aged wooden planks, golden sawdust drifting through warm light, no people, no text, no logos.',
  'Detailed shot of gold trim and bronze fixtures being applied to a restored mahogany ship hull, luxury renovation style, no people, no text, no logos.',
  'FPV camera glide through an empty renovated ship interior with white marble floors, gold-veined walls, warm amber lights, luxury spa atmosphere, no people, no text, no logos.',
  'Final cinematic shot of a polished wooden ship sailing toward a golden horizon, soft ocean mist, elegant luxury finish, no people, no animals, no text, no logos.',
];

export function makeSoraSafeBrollPrompt(prompt: string, sceneIndex = 0): string {
  const sanitized = sanitizeForVideoGeneration(prompt);
  if (SORA_BLOCK_RISK_PATTERN.test(sanitized)) {
    return SAFE_RENOVATION_BROLL[sceneIndex % SAFE_RENOVATION_BROLL.length];
  }
  return `${sanitized}. Object and environment b-roll only. No people, no animals, no humanoids, no faces, no wings, no readable text, no logos, no copyrighted characters.`;
}
