import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, AuthenticatedUser } from '../dto';
import { AppConfig } from '../config';

/**
 * Passport JWT strategy using RS256 (asymmetric) signing.
 * Validates tokens using the public key — the private key is only used for signing.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const publicKey = configService.get('jwt.publicKey', { infer: true });

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: configService.get('jwt.issuer', { infer: true }),
    });
  }

  /**
   * Called after JWT signature is verified. Maps JWT claims to the user object
   * that will be attached to the request.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      role: payload.role,
      examId: payload.examId,
      centerId: payload.centerId,
    };
  }
}
