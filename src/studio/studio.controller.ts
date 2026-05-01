import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateAssetDto } from './dto/create-asset.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ListAssetsDto } from './dto/list-assets.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { UpdateGeneralSettingsDto } from './dto/update-general-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateVideoDefaultsDto } from './dto/update-video-defaults.dto';
import { StudioService } from './studio.service';

type AuthenticatedRequest = Request & { user: { userId: string } };

@UseGuards(AuthGuard('jwt'))
@Controller('studio')
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.studioService.getProfile(req.user.userId);
  }

  @Get('settings/general')
  getGeneralSettings(@Req() req: AuthenticatedRequest) {
    return this.studioService.getGeneralSettings(req.user.userId);
  }

  @Patch('settings/general')
  updateGeneralSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateGeneralSettingsDto,
  ) {
    return this.studioService.updateGeneralSettings(req.user.userId, dto);
  }

  @Get('settings/notifications')
  getNotificationSettings(@Req() req: AuthenticatedRequest) {
    return this.studioService.getNotificationSettings(req.user.userId);
  }

  @Patch('settings/notifications')
  updateNotificationSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.studioService.updateNotificationSettings(req.user.userId, dto);
  }

  @Get('settings/video-defaults')
  getVideoDefaults(@Req() req: AuthenticatedRequest) {
    return this.studioService.getVideoDefaults(req.user.userId);
  }

  @Patch('settings/video-defaults')
  updateVideoDefaults(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateVideoDefaultsDto,
  ) {
    return this.studioService.updateVideoDefaults(req.user.userId, dto);
  }

  @Get('history')
  getAuditLog(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListAuditLogDto,
  ) {
    return this.studioService.getAuditLog(req.user.userId, query);
  }

  @Get('templates')
  listTemplates(@Query() query: ListTemplatesDto) {
    return this.studioService.listTemplates(query);
  }

  @Get('assets')
  listAssets(@Req() req: AuthenticatedRequest, @Query() query: ListAssetsDto) {
    return this.studioService.listAssets(req.user.userId, query);
  }

  @Post('assets')
  createAsset(@Req() req: AuthenticatedRequest, @Body() dto: CreateAssetDto) {
    return this.studioService.createAsset(req.user.userId, dto);
  }
}
