import { SetMetadata } from '@nestjs/common';

export const IS_LONG_RUNNING_KEY = 'isLongRunning';

/**
 * Marks an endpoint as a long-running operation (5-minute timeout instead of 30s).
 * Used for operations like matrix generation, encryption, collusion detection.
 */
export const LongRunning = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_LONG_RUNNING_KEY, true);
