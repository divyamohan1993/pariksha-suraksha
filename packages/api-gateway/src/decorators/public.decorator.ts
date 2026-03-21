import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as publicly accessible — bypasses JWT authentication.
 * Use sparingly. Rate limiting still applies to public endpoints.
 *
 * @example
 * @Public()
 * @Get('verify/:hash')
 * verifySubmission(@Param('hash') hash: string) { ... }
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
