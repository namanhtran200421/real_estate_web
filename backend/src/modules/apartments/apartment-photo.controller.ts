import type { Request, Response } from 'express';
import { apartmentPhotoService } from './apartment-photo.service.js';

async function upload(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await apartmentPhotoService.upload(req.body) });
}

async function get(req: Request<{ id: string }>, res: Response): Promise<void> {
  const photo = await apartmentPhotoService.get(req.params.id);
  res.set({
    'Content-Type': photo.contentType,
    'Content-Length': String(photo.data.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.send(photo.data);
}

export const apartmentPhotoController = { upload, get };
