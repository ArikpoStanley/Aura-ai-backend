import { IsEnum } from 'class-validator';

export class UpdateVideoDefaultsDto {
  @IsEnum(['professional_male', 'professional_female'])
  defaultVoice: 'professional_male' | 'professional_female';

  @IsEnum(['dynamic_word_by_word', 'standard_lower_thirds'])
  captionsStyle: 'dynamic_word_by_word' | 'standard_lower_thirds';
}
