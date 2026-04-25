import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import {
  OtpPurpose,
  OtpVerification,
  OtpVerificationDocument,
} from './schemas/otp-verification.schema';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(OtpVerification.name)
    private otpModel: Model<OtpVerificationDocument>,
  ) {}

  async findByPhone(phoneNumber: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phoneNumber }).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByPhoneWithPassword(
    phoneNumber: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ phoneNumber })
      .select('+passwordHash')
      .exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async findByFacebookId(facebookId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ facebookId }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async createWithPhoneAndPassword(
    phoneNumber: string,
    plainPassword: string,
    displayName?: string,
  ): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    const user = new this.userModel({
      phoneNumber,
      passwordHash,
      displayName,
    });
    return user.save();
  }

  async createWithEmailAndPassword(
    email: string,
    plainPassword: string,
    firstName: string,
    lastName: string,
  ): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    const user = new this.userModel({
      email: email.toLowerCase(),
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim(),
      passwordHash,
    });
    return user.save();
  }

  async updatePassword(userId: string, plainPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    await this.userModel
      .updateOne({ _id: userId }, { $set: { passwordHash } })
      .exec();
  }

  async setGoogleProfile(
    googleId: string,
    displayName: string,
  ): Promise<UserDocument> {
    let user = await this.findByGoogleId(googleId);
    if (!user) {
      user = new this.userModel({ googleId, displayName });
      await user.save();
    } else if (!user.displayName && displayName) {
      user.displayName = displayName;
      await user.save();
    }
    return user;
  }

  async setFacebookProfile(
    facebookId: string,
    displayName: string,
  ): Promise<UserDocument> {
    let user = await this.findByFacebookId(facebookId);
    if (!user) {
      user = new this.userModel({ facebookId, displayName });
      await user.save();
    } else if (!user.displayName && displayName) {
      user.displayName = displayName;
      await user.save();
    }
    return user;
  }

  async upsertOtp(
    identifier: string,
    purpose: OtpPurpose,
    plainCode: string,
    expiresAt: Date,
  ): Promise<void> {
    const codeHash = await bcrypt.hash(plainCode, SALT_ROUNDS);
    await this.otpModel
      .findOneAndUpdate(
        { identifier, purpose },
        { $set: { codeHash, expiresAt } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async verifyOtpAndDelete(
    identifier: string,
    purpose: OtpPurpose,
    plainCode: string,
  ): Promise<boolean> {
    const record = await this.otpModel.findOne({ identifier, purpose }).exec();
    if (!record || record.expiresAt < new Date()) {
      if (record) {
        await this.otpModel.deleteOne({ _id: record._id }).exec();
      }
      return false;
    }
    const ok = await bcrypt.compare(plainCode, record.codeHash);
    await this.otpModel.deleteOne({ _id: record._id }).exec();
    return ok;
  }

  async deleteOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
    await this.otpModel.deleteOne({ identifier, purpose }).exec();
  }
}
