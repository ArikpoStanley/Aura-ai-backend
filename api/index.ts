import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

type HttpHandler = (req: Request, res: Response) => void;

let server: HttpHandler | undefined;

async function getServer(): Promise<HttpHandler> {
  if (!server) {
    const app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpAdapter().getInstance() as HttpHandler;
  }
  return server;
}

export default async function handler(req: Request, res: Response) {
  const appServer = await getServer();
  return appServer(req, res);
}
