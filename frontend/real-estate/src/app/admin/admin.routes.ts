import { Routes } from '@angular/router';
import { adminGuard } from './admin-auth.service';

const title = (page: string) => `${page} · Quản lý`;

/** Owner administration, lazy-loaded under /admin. Everything but sign-in needs a session. */
export const adminRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.AdminLogin),
    title: title('Đăng nhập'),
  },
  {
    path: '',
    loadComponent: () => import('./layout/admin-layout').then((m) => m.AdminLayout),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.AdminDashboard),
        title: title('Tổng quan'),
      },
      {
        path: 'bookings',
        loadComponent: () => import('./pages/bookings/bookings').then((m) => m.AdminBookings),
        title: title('Đặt phòng'),
      },
      {
        path: 'bookings/:reference',
        loadComponent: () => import('./pages/booking-detail/booking-detail').then((m) => m.AdminBookingDetailPage),
        title: title('Chi tiết đặt phòng'),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./pages/calendar/calendar').then((m) => m.AdminCalendar),
        title: title('Lịch'),
      },
      {
        path: 'apartments',
        loadComponent: () => import('./pages/apartments/apartments').then((m) => m.AdminApartments),
        title: title('Căn hộ'),
      },
      {
        path: 'apartments/new',
        loadComponent: () => import('./pages/apartment-edit/apartment-edit').then((m) => m.AdminApartmentEdit),
        title: title('Thêm căn hộ'),
      },
      {
        path: 'apartments/:slug',
        loadComponent: () => import('./pages/apartment-edit/apartment-edit').then((m) => m.AdminApartmentEdit),
        title: title('Sửa căn hộ'),
      },
      {
        path: 'holidays',
        loadComponent: () => import('./pages/holidays/holidays').then((m) => m.AdminHolidays),
        title: title('Ngày lễ'),
      },
      {
        path: 'promo-codes',
        loadComponent: () => import('./pages/promo-codes/promo-codes').then((m) => m.AdminPromoCodes),
        title: title('Mã khuyến mãi'),
      },
      {
        path: 'messages',
        loadComponent: () => import('./pages/messages/messages').then((m) => m.AdminMessages),
        title: title('Tin nhắn'),
      },
      {
        path: 'account',
        loadComponent: () => import('./pages/account/account').then((m) => m.AdminAccount),
        title: title('Tài khoản'),
      },
    ],
  },
];
