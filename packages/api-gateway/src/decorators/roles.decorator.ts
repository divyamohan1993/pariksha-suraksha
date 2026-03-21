import { SetMetadata } from '@nestjs/common';

/**
 * Roles supported by the ParikshaSuraksha RBAC system.
 * Maps to the design spec Section 4.1 role definitions.
 */
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  EXAM_CONTROLLER = 'EXAM_CONTROLLER',
  QUESTION_SETTER = 'QUESTION_SETTER',
  INVIGILATOR = 'INVIGILATOR',
  CANDIDATE = 'CANDIDATE',
  AUDITOR = 'AUDITOR',
}

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific roles.
 * Used in conjunction with RbacGuard.
 *
 * @example
 * @Roles(Role.SUPER_ADMIN, Role.EXAM_CONTROLLER)
 * @Get('sensitive-data')
 * getSensitiveData() { ... }
 */
export const Roles = (...roles: Role[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
