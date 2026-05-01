import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFromUrl(options: {
    sourceUrl: string;
    folder: string;
    publicIdPrefix: string;
    resourceType?: 'image' | 'video' | 'auto';
  }): Promise<{
    public_id: string;
    secure_url: string;
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  }> {
    const result = (await cloudinary.uploader.upload(options.sourceUrl, {
      folder: options.folder,
      public_id: `${options.publicIdPrefix}-${Date.now()}`,
      resource_type: options.resourceType ?? 'auto',
      overwrite: true,
    })) as Record<string, unknown>;

    return {
      public_id: typeof result.public_id === 'string' ? result.public_id : '',
      secure_url:
        typeof result.secure_url === 'string' ? result.secure_url : '',
      width: typeof result.width === 'number' ? result.width : undefined,
      height: typeof result.height === 'number' ? result.height : undefined,
      duration:
        typeof result.duration === 'number' ? result.duration : undefined,
      format: typeof result.format === 'string' ? result.format : undefined,
    };
  }
}
