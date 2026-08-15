import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ACCESS_COOKIE } from './auth-cookies';

type JwtPayload = {
  sub: string;
  email: string;
};

function cookieAccessExtractor(req: Request): string | null {
  const token = req?.cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieAccessExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid token user');
    }

    const roles: string[] = user.userRoles.map(
      (ur: { role: { code: string } }) => ur.role.code,
    );
    const permissions: string[] = Array.from(
      new Set(
        user.userRoles.flatMap(
          (ur: {
            role: {
              rolePermissions: { permission: { code: string } }[];
            };
          }) =>
            ur.role.rolePermissions.map(
              (rp: { permission: { code: string } }) => rp.permission.code,
            ),
        ),
      ),
    );

    return {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      roles,
      permissions,
    };
  }
}
