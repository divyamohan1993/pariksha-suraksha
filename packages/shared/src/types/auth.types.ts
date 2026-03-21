/**
 * Authentication and authorization types for the ParikshaSuraksha exam integrity system.
 */

/**
 * User roles matching the RBAC model defined in the API Gateway spec.
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  EXAM_CONTROLLER = 'EXAM_CONTROLLER',
  QUESTION_SETTER = 'QUESTION_SETTER',
  INVIGILATOR = 'INVIGILATOR',
  CANDIDATE = 'CANDIDATE',
  AUDITOR = 'AUDITOR',
}

/**
 * Authentication payload for login requests.
 */
export interface AuthPayload {
  readonly email: string;
  readonly password: string;
  readonly mfaToken?: string;
}

/**
 * JWT payload embedded in access tokens.
 */
export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: UserRole;
  readonly orgId: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

/**
 * Authentication response returned after successful login.
 */
export interface AuthResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly role: UserRole;
}

/**
 * MFA verification request.
 */
export interface MfaVerifyRequest {
  readonly userId: string;
  readonly mfaToken: string;
  readonly mfaType: 'totp' | 'sms';
}
