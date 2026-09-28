/**
 * Owner administration, mounted at `/api/v1/admin`. Everything except login requires a
 * signed-in admin (`Authorization: Bearer <token>`).
 *
 * Auth
 *   POST /auth/login                       { email, password } → { token, expiresAt, admin }
 *   POST /auth/logout
 *   GET  /auth/me
 *   POST /auth/password                    { currentPassword, newPassword }
 * Dashboard
 *   GET  /summary
 * Bookings
 *   GET  /bookings                         ?status=&apartment=&search=&from=&to=&sort=&page=&pageSize=
 *   GET  /bookings/:reference
 *   POST /bookings/:reference/confirm
 *   POST /bookings/:reference/cancel       { reason }
 *   POST /bookings/:reference/complete
 *   POST /bookings/:reference/payments     { method: cash|bank_transfer, amount, note? }
 *   POST /payments/:paymentId/verify       { amount? }  reported transfer arrived → booking confirmed
 *   POST /payments/:paymentId/reject       { reason }   reported transfer did not arrive
 *   POST /payments/:paymentId/refunds      { amount, reason }
 * Apartments, holidays, promo codes, contact messages: see their routers.
 */
import { Router } from 'express';
import { requireCaptcha } from '../../middleware/captcha.js';
import { loginAccountRateLimiter, loginRateLimiter } from '../../middleware/security.js';
import { adminAuthController } from '../admin-auth/admin-auth.controller.js';
import { requireAdmin } from '../admin-auth/require-admin.js';
import { apartmentAdminRouter } from '../apartments/apartment.admin.router.js';
import { bookingAdminController } from '../bookings/booking.admin.controller.js';
import { contactController } from '../contact/contact.controller.js';
import { holidayAdminRouter } from '../holidays/holiday.admin.router.js';
import { promoCodeAdminRouter } from '../promo-codes/promo-code.admin.router.js';

export const adminRouter = Router();

// Per-IP limit first (bounds CAPTCHA checks), then the CAPTCHA, then the per-account limit, so
// only attempts that solved a challenge count against the owner's account.
adminRouter.post('/auth/login', loginRateLimiter, requireCaptcha, loginAccountRateLimiter, adminAuthController.login);

// Every route below requires a signed-in admin.
adminRouter.use(requireAdmin);

adminRouter.post('/auth/logout', adminAuthController.logout);
adminRouter.get('/auth/me', adminAuthController.me);
adminRouter.post('/auth/password', adminAuthController.changePassword);

adminRouter.get('/summary', bookingAdminController.summary);

adminRouter.get('/bookings', bookingAdminController.list);
adminRouter.get('/bookings/:reference', bookingAdminController.get);
adminRouter.post('/bookings/:reference/confirm', bookingAdminController.confirm);
adminRouter.post('/bookings/:reference/cancel', bookingAdminController.cancel);
adminRouter.post('/bookings/:reference/complete', bookingAdminController.complete);
adminRouter.post('/bookings/:reference/payments', bookingAdminController.recordPayment);
adminRouter.post('/payments/:paymentId/verify', bookingAdminController.verifyTransfer);
adminRouter.post('/payments/:paymentId/reject', bookingAdminController.rejectTransfer);
adminRouter.post('/payments/:paymentId/refunds', bookingAdminController.refund);

adminRouter.use('/apartments', apartmentAdminRouter);
adminRouter.use('/holidays', holidayAdminRouter);
adminRouter.use('/promo-codes', promoCodeAdminRouter);

adminRouter.get('/contact-messages', contactController.list);
adminRouter.put('/contact-messages/:id/handled', contactController.setHandled);
