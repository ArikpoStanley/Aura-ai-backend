import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_TYP_ACCESS } from '../auth.constants';
import { UsersService } from '../../users/users.service';

export type AccessTokenUser = {
  userId: string;
  email: string | null;
  phoneNumber: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    typ?: string;
    email?: string;
    phoneNumber?: string;
  }): Promise<AccessTokenUser> {
    if (payload.typ !== JWT_TYP_ACCESS) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      userId: user._id.toString(),
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
    };
  }
}
