export const TEMPLATE_CATEGORIES = [
  'all',
  'explainer',
  'social_media',
  'corporate',
  'finance',
  'lifestyle',
] as const;

export const VIDEO_TEMPLATES = [
  {
    id: 'tech-startup-explainer',
    title: 'Tech Startup Explainer',
    category: 'explainer',
    duration: '0:59',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=🚀',
  },
  {
    id: 'motivational-morning',
    title: 'Motivational Morning',
    category: 'social_media',
    duration: '0:16',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=☀️',
  },
  {
    id: 'real-estate-tour',
    title: 'Real Estate Tour',
    category: 'corporate',
    duration: '0:59',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=🏠',
  },
  {
    id: 'crypto-daily-news',
    title: 'Crypto Daily News',
    category: 'finance',
    duration: '0:56',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=📊',
  },
  {
    id: 'instagram-showcase',
    title: 'Instagram Product Showcase',
    category: 'social_media',
    duration: '1:21',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=🛍️',
  },
  {
    id: 'fitness-30day',
    title: 'Fitness 30-Day Challenge',
    category: 'lifestyle',
    duration: '0:35',
    thumbnail: 'https://placehold.co/400x240/1f2937/ffffff?text=🏋️',
  },
] as const;
