import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ sparse: true, unique: true, trim: true, lowercase: true })
  email?: string;

  @Prop({ sparse: true, unique: true, trim: true })
  phoneNumber?: string;

  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ sparse: true, unique: true })
  googleId?: string;

  @Prop({ sparse: true, unique: true })
  facebookId?: string;

  @Prop({ trim: true })
  displayName?: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  timezone?: string;

  @Prop({ trim: true })
  language?: string;

  @Prop({ enum: ['light', 'dark', 'system'], default: 'dark' })
  themePreference?: 'light' | 'dark' | 'system';

  @Prop({ default: true })
  notificationsVideoComplete?: boolean;

  @Prop({ default: false })
  notificationsWeeklyReport?: boolean;

  @Prop({ default: true })
  notificationsProductUpdates?: boolean;

  @Prop({
    enum: ['professional_male', 'professional_female'],
    default: 'professional_male',
  })
  defaultVoice?: 'professional_male' | 'professional_female';

  @Prop({
    enum: ['dynamic_word_by_word', 'standard_lower_thirds'],
    default: 'dynamic_word_by_word',
  })
  captionsStyle?: 'dynamic_word_by_word' | 'standard_lower_thirds';

  @Prop({ default: 100 })
  monthlyCredits?: number;

  @Prop({ default: 8 })
  creditsLeft?: number;

  @Prop()
  planName?: string;

  @Prop()
  memberSince?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
