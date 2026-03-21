import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AppConfig } from '../config';

export interface GoogleUser {
  googleId: string;
  email: string;
  displayName: string;
  picture?: string;
}

/**
 * Google OAuth 2.0 strategy for admin login.
 * Only whitelisted admin emails (verified against the user store) are permitted.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      clientID: configService.get('google.clientId', { infer: true }),
      clientSecret: configService.get('google.clientSecret', { infer: true }),
      callbackURL: configService.get('google.callbackUrl', { infer: true }),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const user: GoogleUser = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      displayName: profile.displayName,
      picture: profile.photos?.[0]?.value,
    };
    done(null, user);
  }
}
