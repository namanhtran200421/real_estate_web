/**
 * API route table. Every feature module registers its router here, under a versioned
 * prefix, so breaking changes can later ship as `/v2` without disturbing existing clients.
 */
import { Router } from 'express';
import { adminRouter } from './modules/admin/admin.router.js';
import { apartmentRouter } from './modules/apartments/apartment.router.js';
import { bookingRouter } from './modules/bookings/booking.router.js';
import { contactController } from './modules/contact/contact.controller.js';

export const apiRouter = Router();

apiRouter.use('/v1/apartments', apartmentRouter);
apiRouter.use('/v1/bookings', bookingRouter);
apiRouter.post('/v1/contact', contactController.submit);
apiRouter.use('/v1/admin', adminRouter);
