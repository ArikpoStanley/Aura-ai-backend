import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TEMPLATE_CATEGORIES, VIDEO_TEMPLATES } from './constants/templates';
import { ListAssetsDto } from './dto/list-assets.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { UpdateGeneralSettingsDto } from './dto/update-general-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateVideoDefaultsDto } from './dto/update-video-defaults.dto';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { MediaAsset, MediaAssetDocument } from './schemas/media-asset.schema';

@Injectable()
export class StudioService {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(MediaAsset.name)
    private readonly mediaAssetModel: Model<MediaAssetDocument>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      id: user?._id.toString() ?? userId,
      fullName:
        `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'User',
      email: user?.email ?? '',
      planName: user?.planName ?? 'PRO PLAN',
      memberSince: user?.memberSince ?? new Date('2024-10-01'),
      monthlyCredits: user?.monthlyCredits ?? 100,
      creditsLeft: user?.creditsLeft ?? 8,
    };
  }

  async getGeneralSettings(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      language: user?.language ?? 'English (US)',
      timezone: user?.timezone ?? 'UTC-08:00 Pacific Time',
      themePreference: user?.themePreference ?? 'dark',
    };
  }

  async updateGeneralSettings(userId: string, dto: UpdateGeneralSettingsDto) {
    await this.usersService.updateById(userId, dto);
    return this.getGeneralSettings(userId);
  }

  async getNotificationSettings(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      videoGenerationComplete: user?.notificationsVideoComplete ?? true,
      weeklyReport: user?.notificationsWeeklyReport ?? false,
      productUpdates: user?.notificationsProductUpdates ?? true,
    };
  }

  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    await this.usersService.updateById(userId, {
      notificationsVideoComplete: dto.videoGenerationComplete,
      notificationsWeeklyReport: dto.weeklyReport,
      notificationsProductUpdates: dto.productUpdates,
    });
    return this.getNotificationSettings(userId);
  }

  async getVideoDefaults(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      defaultVoice: user?.defaultVoice ?? 'professional_male',
      captionsStyle: user?.captionsStyle ?? 'dynamic_word_by_word',
      options: {
        defaultVoice: [
          { id: 'professional_male', label: 'Professional male' },
          { id: 'professional_female', label: 'Professional female' },
        ],
        captionsStyle: [
          { id: 'dynamic_word_by_word', label: 'Dynamic word-by-word' },
          { id: 'standard_lower_thirds', label: 'Standard lower-thirds' },
        ],
      },
    };
  }

  async updateVideoDefaults(userId: string, dto: UpdateVideoDefaultsDto) {
    await this.usersService.updateById(userId, dto);
    return this.getVideoDefaults(userId);
  }

  async getAuditLog(userId: string, query: ListAuditLogDto) {
    const limit = query.limit ?? 30;
    const logs = await this.auditLogModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return logs.map((log) => ({
      id: log._id.toString(),
      status: log.status,
      date: log.createdAt,
      action: log.action,
      detail: log.detail,
      costCredits: log.costCredits,
    }));
  }

  listTemplates(query: ListTemplatesDto) {
    const category = query.category?.toLowerCase();
    const search = query.search?.toLowerCase().trim();
    const templates = VIDEO_TEMPLATES.filter((template) => {
      const categoryMatch =
        !category || category === 'all' || template.category === category;
      const searchMatch =
        !search ||
        template.title.toLowerCase().includes(search) ||
        template.category.toLowerCase().includes(search);
      return categoryMatch && searchMatch;
    });
    return {
      categories: TEMPLATE_CATEGORIES,
      templates,
    };
  }

  async listAssets(userId: string, query: ListAssetsDto) {
    const filter: { userId: string; type?: 'image' | 'audio' | 'video' } = {
      userId,
    };
    if (query.type) {
      filter.type = query.type;
    }
    const assets = await this.mediaAssetModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    return assets.map((asset) => ({
      id: asset._id.toString(),
      name: asset.name,
      type: asset.type,
      sizeBytes: asset.sizeBytes,
      url: asset.url,
      createdAt: asset.createdAt,
    }));
  }

  async createAsset(userId: string, dto: CreateAssetDto) {
    const asset = await this.mediaAssetModel.create({
      userId,
      name: dto.name,
      type: dto.type,
      sizeBytes: dto.sizeBytes,
      url: dto.url,
    });
    return {
      id: asset._id.toString(),
      name: asset.name,
      type: asset.type,
      sizeBytes: asset.sizeBytes,
      url: asset.url,
      createdAt: asset.createdAt,
    };
  }
}
