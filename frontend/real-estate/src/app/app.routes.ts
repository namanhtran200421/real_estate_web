import { Routes } from '@angular/router';
import { SITE } from './data/site';

const title = (page: string) => `${page} · ${SITE.name}`;

// Booking pages are private per customer: keep them out of search results.
const NOINDEX = { robots: 'noindex, nofollow' };

// Every page is lazy-loaded into its own chunk. Apartment-specific pages read
// `?apt=<slug>`; without it they show the first apartment. The payment page reads `?ref=`
// (the booking reference).
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: `${SITE.name} · Căn hộ Sun Garden Đà Lạt`,
  },
  {
    path: 'apartment',
    loadComponent: () => import('./pages/apartment-detail/apartment-detail').then((m) => m.ApartmentDetail),
    title: title('Thông tin căn hộ'),
  },
  {
    path: 'gallery',
    loadComponent: () => import('./pages/gallery/gallery').then((m) => m.Gallery),
    title: title('Hình ảnh'),
  },
  {
    path: 'availability',
    loadComponent: () => import('./pages/availability/availability').then((m) => m.Availability),
    title: title('Lịch trống'),
  },
  {
    path: 'location',
    loadComponent: () => import('./pages/location/location').then((m) => m.LocationPage),
    title: title('Vị trí'),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((m) => m.About),
    title: title('Về chúng tôi'),
    data: { description: `${SITE.name}: căn hộ Sun Garden A04-12 tại Đà Lạt, 78 m², 2 phòng ngủ và 2 phòng tắm.` },
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
    title: title('Liên hệ'),
    data: { description: `Liên hệ ${SITE.name} qua điện thoại, Zalo hoặc email để được hỗ trợ đặt căn hộ.` },
  },
  {
    path: 'book',
    loadComponent: () => import('./pages/booking/booking').then((m) => m.BookingPage),
    title: title('Đặt lịch'),
    data: NOINDEX,
  },
  {
    path: 'book/review',
    loadComponent: () => import('./pages/booking-review/booking-review').then((m) => m.BookingReview),
    title: title('Xem lại đặt phòng'),
    data: NOINDEX,
  },
  {
    path: 'book/payment',
    loadComponent: () => import('./pages/booking-payment/booking-payment').then((m) => m.BookingPayment),
    title: title('Thanh toán'),
    data: NOINDEX,
  },
  {
    path: 'booking/manage',
    loadComponent: () => import('./pages/booking-lookup/booking-lookup').then((m) => m.BookingLookup),
    title: title('Tra cứu đặt phòng'),
    data: NOINDEX,
  },
  {
    path: 'booking/:reference/confirmation',
    loadComponent: () =>
      import('./pages/booking-confirmation/booking-confirmation').then((m) => m.BookingConfirmation),
    title: title('Xác nhận đặt phòng'),
    data: NOINDEX,
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.adminRoutes),
    data: NOINDEX,
  },
  { path: '**', redirectTo: '' },
];
