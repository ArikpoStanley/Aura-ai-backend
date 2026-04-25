import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';
import { UsersService } from '../../users/users.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      clientID: config.getOrThrow<string>('FACEBOOK_APP_ID'),
      clientSecret: config.getOrThrow<string>('FACEBOOK_APP_SECRET'),
      callbackURL: config.get<string>(
        'FACEBOOK_CALLBACK_URL',
        'http://localhost:3000/auth/facebook/callback',
      ),
      profileFields: ['id', 'displayName', 'emails'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<{ userId: string }> {
    const displayName =
      profile.displayName ?? profile.emails?.[0]?.value ?? 'Facebook user';
    const user = await this.usersService.setFacebookProfile(
      profile.id,
      displayName,
    );
    return { userId: user._id.toString() };
  }
}
