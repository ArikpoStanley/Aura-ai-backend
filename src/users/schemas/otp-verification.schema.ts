import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpPurpose = 'signup' | 'reset_password';

export type OtpVerificationDocument = HydratedDocument<OtpVerification>;

@Schema({ timestamps: true, collection: 'otp_verifications' })
export class OtpVerification {
  @Prop({ required: true, trim: true })
  identifier: string;

  @Prop({ type: String, enum: ['signup', 'reset_password'], required: true })
  purpose: OtpPurpose;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const OtpVerificationSchema =
  SchemaFactory.createForClass(OtpVerification);

OtpVerificationSchema.index({ identifier: 1, purpose: 1 }, { unique: true });
