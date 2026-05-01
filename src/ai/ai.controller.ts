import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AiService } from './ai.service';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GeneratePromptDto } from './dto/generate-prompt.dto';
import { RemixVideoDto } from './dto/remix-video.dto';

type AuthenticatedRequest = Request & { user: { userId: string } };

@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('prompts/generate')
  generatePrompt(@Body() dto: GeneratePromptDto) {
    return this.aiService.generatePrompt(dto);
  }

  @Post('images/generate')
  generateImage(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateImageDto,
  ) {
    return this.aiService.generateImage(req.user.userId, dto);
  }

  @Post('characters/generate')
  generateCharacter(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateCharacterDto,
  ) {
    return this.aiService.generateCharacter(req.user.userId, dto);
  }

  @Post('videos/remix')
  remixVideo(@Req() req: AuthenticatedRequest, @Body() dto: RemixVideoDto) {
    return this.aiService.remixVideo(req.user.userId, dto);
  }
}
