import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import {
  CreateFacelessVideoDto,
  CreatePhotosScriptDto,
  CreateTextToVideoDto,
  CreateYoutubeRepurposeDto,
} from './dto/create-by-mode.dto';
import { CreateVideoProjectDto } from './dto/create-video-project.dto';
import { ListVideoProjectsDto } from './dto/list-video-projects.dto';
import { VideoStudioService } from './video-studio.service';

type AuthenticatedRequest = Request & { user: { userId: string } };

@UseGuards(AuthGuard('jwt'))
@Controller('video-studio')
export class VideoStudioController {
  constructor(private readonly videoStudioService: VideoStudioService) {}

  @Get('options')
  getOptions() {
    return this.videoStudioService.getCreationOptions();
  }

  @Post('projects')
  createProject(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateVideoProjectDto,
  ) {
    return this.videoStudioService.createProject(req.user.userId, dto);
  }

  @Post('projects/text-to-video')
  createTextToVideo(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTextToVideoDto,
  ) {
    return this.videoStudioService.createTextToVideo(req.user.userId, dto);
  }

  @Post('projects/photos-script')
  createPhotosScript(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePhotosScriptDto,
  ) {
    return this.videoStudioService.createPhotosScript(req.user.userId, dto);
  }

  @Post('projects/youtube-repurpose')
  createYoutubeRepurpose(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateYoutubeRepurposeDto,
  ) {
    return this.videoStudioService.createYoutubeRepurpose(req.user.userId, dto);
  }

  @Post('projects/faceless-video')
  createFacelessVideo(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFacelessVideoDto,
  ) {
    return this.videoStudioService.createFacelessVideo(req.user.userId, dto);
  }

  @Get('projects')
  listProjects(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListVideoProjectsDto,
  ) {
    return this.videoStudioService.listProjects(req.user.userId, query);
  }

  @Get('dashboard')
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.videoStudioService.getDashboard(req.user.userId);
  }
}
