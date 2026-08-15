import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

export function requireCompanyId(user: AuthUser): string {
  if (!user.companyId) {
    throw new ForbiddenException('Company context required');
  }
  return user.companyId;
}
