import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type {
  ComposeVideoInput,
  ComposeVideoResult,
  VideoRenderer,
} from '../providers/video-renderer.provider';

const execFileAsync = promisify(execFile);

@Injectable()
export class FfmpegRendererService implements VideoRenderer {
  readonly name = 'ffmpeg';
  private readonly logger = new Logger(FfmpegRendererService.name);
  private readonly tempDir: string;

  constructor(private readonly config: ConfigService) {
    this.tempDir =
      this.config.get<string>('FFMPEG_TEMP_DIR') ??
      path.join(os.tmpdir(), 'auravid-render');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  private resolveAspect(aspectRatio: string): { w: number; h: number } {
    const n = aspectRatio.replace(/\s/g, '');
    if (n === '9:16' || n.includes('9:16')) {
      return { w: 1080, h: 1920 };
    }
    if (n === '1:1' || n.includes('1:1')) {
      return { w: 1080, h: 1080 };
    }
    return { w: 1920, h: 1080 };
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    try {
      await execFileAsync('ffmpeg', ['-y', ...args], {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`FFmpeg failed: ${msg}`);
    }
  }

  private buildVideoFilter(
    width: number,
    height: number,
    caption: string | undefined,
    captionFile: string,
  ): string {
    const base = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
    const text = caption?.trim();
    if (!text) {
      return base;
    }

    fs.writeFileSync(captionFile, text.slice(0, 80));
    const fontSize = Math.max(36, Math.round(height * 0.035));
    const y = Math.round(height * 0.78);
    const fontfile = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    const fontOpt = fs.existsSync(fontfile) ? `:fontfile=${fontfile}` : '';
    return [
      base,
      `drawtext=textfile=${captionFile}${fontOpt}:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.62:boxborderw=24:x=(w-text_w)/2:y=${y}`,
    ].join(',');
  }

  async compose(input: ComposeVideoInput): Promise<ComposeVideoResult> {
    const { w, h } = this.resolveAspect(input.aspectRatio);
    const workDir = path.join(this.tempDir, `job-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const trimmedPaths: string[] = [];
    for (let i = 0; i < input.scenes.length; i++) {
      const scene = input.scenes[i];
      const trimmed = path.join(workDir, `scene-${i}.mp4`);
      const captionFile = path.join(workDir, `caption-${i}.txt`);
      const vf = this.buildVideoFilter(w, h, scene.caption, captionFile);
      await this.runFfmpeg([
        '-i',
        scene.filePath,
        '-t',
        String(scene.durationSeconds),
        '-vf',
        vf,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        trimmed,
      ]);
      trimmedPaths.push(trimmed);
    }

    const listFile = path.join(workDir, 'concat.txt');
    fs.writeFileSync(
      listFile,
      trimmedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    );

    const silentVideo = path.join(workDir, 'silent.mp4');
    await this.runFfmpeg([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c',
      'copy',
      silentVideo,
    ]);

    let finalPath = silentVideo;
    if (input.narrationPath && fs.existsSync(input.narrationPath)) {
      const withAudio = path.join(workDir, 'with-audio.mp4');
      await this.runFfmpeg([
        '-i',
        silentVideo,
        '-i',
        input.narrationPath,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        withAudio,
      ]);
      finalPath = withAudio;
    }

    fs.copyFileSync(finalPath, input.outputPath);
    const durationSeconds = input.scenes.reduce(
      (sum, s) => sum + s.durationSeconds,
      0,
    );

    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      this.logger.warn(`Could not clean work dir ${workDir}`);
    }

    return { outputPath: input.outputPath, durationSeconds };
  }

  async createKenBurnsFromImage(
    imageUrl: string,
    durationSeconds: number,
    aspectRatio: string,
    outputPath: string,
  ): Promise<ComposeVideoResult> {
    const { w, h } = this.resolveAspect(aspectRatio);
    const imagePath = path.join(this.tempDir, `img-${Date.now()}.jpg`);
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30_000,
    });
    fs.writeFileSync(imagePath, Buffer.from(response.data));

    const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+0.0015,1.15)':d=${durationSeconds * 25}:s=${w}x${h}:fps=25`;
    await this.runFfmpeg([
      '-loop',
      '1',
      '-i',
      imagePath,
      '-t',
      String(durationSeconds),
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ]);

    try {
      fs.unlinkSync(imagePath);
    } catch {
      /* ignore */
    }

    return { outputPath, durationSeconds };
  }
}
