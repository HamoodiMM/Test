import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Custom decorator: marks a route as "no login needed".
// It only attaches a label (metadata); AuthGuard reads that label with the Reflector.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
