import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

export const REQUIRE_MODULE_KEY = 'requireModule';
export const RequireModule = (moduleCode: string) =>
  SetMetadata(REQUIRE_MODULE_KEY, moduleCode);

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleCode = this.reflector.getAllAndOverride<string>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!moduleCode) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user?.companyId) {
      throw new ForbiddenException('Company context required for this module');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { enabledModules: true, status: true },
    });

    if (!company || company.status === 'suspended') {
      throw new ForbiddenException('Company is not active');
    }

    let modules: string[] = [];
    const raw = company.enabledModules;
    if (Array.isArray(raw)) {
      modules = raw.map(String);
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        modules = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        modules = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    if (!modules.includes(moduleCode)) {
      throw new ForbiddenException(`Module "${moduleCode}" is not enabled`);
    }

    return true;
  }
}
