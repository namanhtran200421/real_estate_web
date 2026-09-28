/**
 * Contact form handlers: public submission and the owner's inbox.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { blankAsUndefined, email, optionalText, pagination, parse, phone, slug, text } from '../../lib/validation.js';
import { contactService } from './contact.service.js';

const contactBody = z.object({
  name: text(120),
  phone,
  email: blankAsUndefined(email),
  topic: text(80),
  apartmentSlug: blankAsUndefined(slug),
  message: text(3_000),
  // Honeypot: a field hidden from people. Bots fill every field; a filled one is silently dropped.
  website: optionalText(200),
});

const listQuery = z.object({ unhandled: z.enum(['true', 'false']).default('false'), ...pagination });
const handledBody = z.object({ handled: z.boolean() });

/** POST /contact → 202 */
async function submit(req: Request, res: Response): Promise<void> {
  const { website, ...message } = parse(contactBody, req.body);
  if (!website) await contactService.submit(message, req.ip);
  res.status(202).json({ data: { received: true } });
}

/** GET /admin/contact-messages?unhandled=true&page=&pageSize= */
async function list(req: Request, res: Response): Promise<void> {
  const query = parse(listQuery, req.query);
  res.json({ data: await contactService.list(query.unhandled === 'true', query.page, query.pageSize) });
}

/** PUT /admin/contact-messages/:id/handled { handled } */
async function setHandled(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parse(z.uuid(), req.params.id);
  const { handled } = parse(handledBody, req.body);
  await contactService.setHandled(id, handled);
  res.status(204).end();
}

export const contactController = { submit, list, setHandled };
