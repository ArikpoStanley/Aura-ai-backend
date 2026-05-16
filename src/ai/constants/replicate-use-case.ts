/** Replicate routing keys — one per product flow. */
export enum ReplicateUseCase {
  TextToVideo = 'text_to_video',
  FacelessVideo = 'faceless_video',
  YoutubeRepurpose = 'youtube_repurpose',
  PhotosScriptImage = 'photos_script_image',
  PhotosScriptVideo = 'photos_script_video',
  ImageGenerate = 'image_generate',
  CharacterGenerate = 'character_generate',
  VideoRemix = 'video_remix',
}

export type VideoLengthTier = 'short' | 'medium' | 'long';
