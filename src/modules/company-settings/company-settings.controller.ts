import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { requireCompanyId } from '../../common/utils/tenant';
import { CompanySettingsService } from './company-settings.service';
import {
  PatchCompanySettingsDto,
  PutDocumentSeriesDto,
} from './dto/company-settings.dto';

@ApiTags('company-settings')
@ApiBearerAuth()
@Controller('company')
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get('settings')
  @RequirePermissions('company.settings.read')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.settings.getSettings(requireCompanyId(user));
  }

  @Patch('settings')
  @RequirePermissions('company.settings.write')
  patchSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: PatchCompanySettingsDto,
  ) {
    return this.settings.updateSettings(
      requireCompanyId(user),
      user.id,
      body,
    );
  }

  @Get('document-series')
  @RequirePermissions('company.settings.read')
  listSeries(@CurrentUser() user: AuthUser) {
    return this.settings.listSeries(requireCompanyId(user));
  }

  @Put('document-series')
  @RequirePermissions('company.settings.write')
  putSeries(
    @CurrentUser() user: AuthUser,
    @Body() body: PutDocumentSeriesDto,
  ) {
    return this.settings.replaceSeries(
      requireCompanyId(user),
      user.id,
      body,
    );
  }
}
