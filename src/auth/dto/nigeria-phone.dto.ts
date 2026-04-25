import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { normalizePhoneNumber } from '../../common/transforms/normalize-phone';

/** Normalizes spaces; validates Nigerian numbers as +234 + 10 digits (E.164 style). */
export class NigeriaPhoneDto {
  @Transform(({ value }) => normalizePhoneNumber(value))
  @Matches(/^\+234\d{10}$/, {
    message: 'Phone number not complete!',
  })
  phoneNumber: string;
}
