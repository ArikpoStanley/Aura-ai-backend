import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { MediaAsset, MediaAssetSchema } from './schemas/media-asset.schema';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: MediaAsset.name, schema: MediaAssetSchema },
    ]),
  ],
  controllers: [StudioController],
  providers: [StudioService],
})
export class StudioModule {}
