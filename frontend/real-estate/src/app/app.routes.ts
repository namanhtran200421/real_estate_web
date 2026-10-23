import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminRoutes } from './admin/admin.routes';

import { STORY } from './motion/motion-routes';

// Booking pages are private per customer: keep them out of search results.
const NOINDEX = { robots: 'noindex, nofollow' };

// `title` and `data.description` are translation keys (src/i18n/*.json), translated by SeoTitleStrategy.
// Every page is lazy-loaded into its own chunk. Apartment-specific pages read
// `?apt=<slug>`; without it they show the first apartment. The payment page reads `?ref=`
// (the booking reference).
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'titles.home',
    data: STORY,
  },
  {
    path: 'apartment',
    loadComponent: () => import('./pages/apartment-detail/apartment-detail').then((m) => m.ApartmentDetail),
    title: 'titles.apartment',
    data: STORY,
  },
  {
    path: 'gallery',
    loadComponent: () => import('./pages/gallery/gallery').then((m) => m.Gallery),
    title: 'titles.gallery',
    data: STORY,
  },
  // The availability page is gone: the booking page has the calendar. Old links land there (query kept).
  { path: 'availability', redirectTo: ({ queryParams }) => inject(Router).createUrlTree(['/book'], { queryParams }) },
  {
    path: 'location',
    loadComponent: () => import('./pages/location/location').then((m) => m.LocationPage),
    title: 'titles.location',
    data: STORY,
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((m) => m.About),
    title: 'titles.about',
    data: { ...STORY, description: 'meta.about' },
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
    title: 'titles.contact',
    data: { description: 'meta.contact' },
  },
  {
    path: 'policy',
    loadComponent: () => import('./pages/policy/policy').then((m) => m.Policy),
    title: 'titles.policy',
    data: { description: 'meta.policy' },
  },
  {
    path: 'book',
    loadComponent: () => import('./pages/booking/booking').then((m) => m.BookingPage),
    title: 'titles.book',
    data: NOINDEX,
  },
  {
    path: 'book/review',
    loadComponent: () => import('./pages/booking-review/booking-review').then((m) => m.BookingReview),
    title: 'titles.review',
    data: NOINDEX,
  },
  {
    path: 'book/payment',
    loadComponent: () => import('./pages/booking-payment/booking-payment').then((m) => m.BookingPayment),
    title: 'titles.payment',
    data: NOINDEX,
  },
  {
    path: 'booking/manage',
    loadComponent: () => import('./pages/booking-lookup/booking-lookup').then((m) => m.BookingLookup),
    title: 'titles.lookup',
    data: NOINDEX,
  },
  {
    path: 'booking/:reference/confirmation',
    loadComponent: () =>
      import('./pages/booking-confirmation/booking-confirmation').then((m) => m.BookingConfirmation),
    title: 'titles.confirmation',
    data: NOINDEX,
  },
  {
    path: 'admin',
    // Register the small route map immediately, avoiding another network discovery step.
    // Owner page components remain lazy and are never preloaded for guests.
    children: adminRoutes,
    data: { ...NOINDEX, preload: false },
  },
  { path: '**', redirectTo: '' },
];
