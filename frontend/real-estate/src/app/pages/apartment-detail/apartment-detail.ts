import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApartmentGallery } from '../../components/apartment-gallery/apartment-gallery';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingCard } from '../../components/booking-card/booking-card';
import { PriceList } from '../../components/price-list/price-list';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-apartment-detail',
  imports: [RouterLink, ApartmentGallery, ApartmentHeader, ApartmentNotFound, BookingCard, PriceList],
  templateUrl: './apartment-detail.html',
})
export class ApartmentDetail {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'Tổng quan', path: '/apartment' });
    });
  }

  protected readonly explore = [
    { path: '/gallery', label: 'Hình ảnh', text: 'Xem toàn bộ ảnh căn hộ' },
    { path: '/availability', label: 'Lịch trống', text: 'Kiểm tra ngày còn trống' },
    { path: '/location', label: 'Vị trí', text: 'Bản đồ và địa điểm lân cận' },
  ];
}
