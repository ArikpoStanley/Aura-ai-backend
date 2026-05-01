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
