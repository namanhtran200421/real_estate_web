import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingCard } from '../../components/booking-card/booking-card';
import { MobileBookBar } from '../../components/mobile-book-bar/mobile-book-bar';
import { NavyBand } from '../../components/navy-band/navy-band';
import { PriceList } from '../../components/price-list/price-list';
import { RoomTour } from '../../components/room-tour/room-tour';
import { Split } from '../../motion/split';
import { roomPhoto } from '../../data/sun-garden-rooms';
import { ApartmentService } from '../../services/apartment.service';
import { SUN_GARDEN_AMENITIES } from '../../data/sun-garden-amenities';
import { SeoService } from '../../services/seo.service';
import { ApiResponse } from '../../core/api';
import { GuestReview } from '../../models/guest-review';
import { GuestReviewService } from '../../services/guest-review.service';
import { googleMapEmbedUrl, preconnectGoogleMaps } from '../../shared/google-maps';

type FacilityIcon = 'apartment' | 'furnished' | 'kitchen' | 'bathrooms' | 'wifi' | 'laundry' | 'check';

const FACILITY_ICONS: Record<string, FacilityIcon> = {
  'Căn hộ 2 phòng ngủ': 'apartment',
  'Two-bedroom apartment': 'apartment',
  'Đầy đủ nội thất': 'furnished',
  'Fully furnished': 'furnished',
  'Bếp riêng đầy đủ tiện nghi': 'kitchen',
  'Fully equipped private kitchen': 'kitchen',
  '2 phòng tắm riêng': 'bathrooms',
  'Two private bathrooms': 'bathrooms',
  'Wi-Fi miễn phí': 'wifi',
  'Free Wi-Fi': 'wifi',
  'Máy giặt & sấy': 'laundry',
  'Washer and dryer': 'laundry',
};

@Component({
  selector: 'app-apartment-detail',
  imports: [DatePipe, DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe, ApartmentHeader, ApartmentNotFound, BookingCard, MobileBookBar, NavyBand, PriceList, RoomTour, Split],
  templateUrl: './apartment-detail.html',
})
export class ApartmentDetail {
  private readonly apartments = inject(ApartmentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly reviewService = inject(GuestReviewService);
  protected readonly amenityGroups = SUN_GARDEN_AMENITIES;
  /** True only when arriving from the Home room index morph (navigation state), never on a direct load. */
  protected readonly morphed = inject(Router).currentNavigation()?.extras.state?.['morph'] === true;

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly heroPhoto = computed(() => {
    const apt = this.apartment();
    return apt ? (roomPhoto(apt, '07') ?? apt.photos[0]) : undefined;
  });
  private readonly reviewList = httpResource<ApiResponse<GuestReview[]>>(() => {
    const slug = this.apartment()?.slug;
    return slug ? this.reviewService.listUrl(slug) : undefined;
  });
  protected readonly reviews = computed(() => this.reviewList.value()?.data ?? []);
  protected readonly reviewsLoading = computed(() => this.reviewList.isLoading());
  protected readonly reviewsFailed = computed(() => this.reviewList.status() === 'error');
  protected facilityIcon(item: string): FacilityIcon {
    return FACILITY_ICONS[item] ?? 'check';
  }
  protected readonly mapsLink = computed(() =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.apartment()?.mapQuery ?? '')}`,
  );
  protected readonly mapUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(googleMapEmbedUrl(this.apartment()?.mapQuery ?? '')),
  );

  constructor() {
    preconnectGoogleMaps();
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.overview', path: '/apartment' });
    });
  }
}
