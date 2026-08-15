import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { requireCompanyId } from '../../common/utils/tenant';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  ModuleEnabledGuard,
  RequireModule,
} from '../../common/guards/module-enabled.guard';
import { IsOptional, IsString, MaxLength } from 'class-validator';

class AiPromptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('inventory-summary')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermissions('store.stock.read')
  summarize(
    @CurrentUser() user: AuthUser,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.summarizeInventory(
      requireCompanyId(user),
      user.id,
      body?.prompt,
    );
  }

  @Post('aging-brief')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermissions('store.dashboard.read')
  agingBrief(
    @CurrentUser() user: AuthUser,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.agingBrief(requireCompanyId(user), user.id, body?.prompt);
  }

  @Post('grn-qc-brief')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermissions('store.grn.read')
  grnQcBrief(
    @CurrentUser() user: AuthUser,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.grnQcBrief(requireCompanyId(user), user.id, body?.prompt);
  }

  @Post('reorder-suggestions')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermissions('store.stock.read')
  reorder(
    @CurrentUser() user: AuthUser,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.reorderSuggestions(
      requireCompanyId(user),
      user.id,
      body?.prompt,
    );
  }

  @Post('accounts-check')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermissions('accounts.grn.read')
  accountsCheck(
    @CurrentUser() user: AuthUser,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.accountsCheck(
      requireCompanyId(user),
      user.id,
      body?.prompt,
    );
  }
}
