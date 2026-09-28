/**
 * Contact form: stores each message and emails it to the owner.
 */
import { withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { apartmentRepository } from '../apartments/apartment.repository.js';
import type { AdminApartment } from '../apartments/apartment.types.js';
import { emailService } from '../notifications/email.service.js';
import type { Page } from '../bookings/booking.types.js';
import { contactRepository } from './contact.repository.js';
import type { ContactMessage, NewContactMessage } from './contact.types.js';

async function submit(message: NewContactMessage, ip: string | undefined): Promise<void> {
  await withTransaction(async (db) => {
    let apartment: AdminApartment | undefined;
    if (message.apartmentSlug) apartment = await apartmentRepository.findBySlug(message.apartmentSlug, db);

    await contactRepository.insert(message, apartment?.id ?? null, ip, db);
    await emailService.queueContactMessage(
      {
        name: message.name,
        phone: message.phone,
        email: message.email ?? null,
        topic: message.topic,
        apartmentName: apartment?.name ?? null,
        message: message.message,
      },
      db,
    );
  });
}

async function list(unhandledOnly: boolean, page: number, pageSize: number): Promise<Page<ContactMessage>> {
  const result = await contactRepository.list({ unhandledOnly, limit: pageSize, offset: (page - 1) * pageSize });
  return { ...result, page, pageSize };
}

async function setHandled(id: string, handled: boolean): Promise<void> {
  const found = await contactRepository.setHandled(id, handled);
  if (!found) throw HttpError.notFound('Không tìm thấy tin nhắn.');
}

export const contactService = { submit, list, setHandled };
