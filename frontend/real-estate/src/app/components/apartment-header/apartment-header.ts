import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Apartment } from '../../models/apartment';

/** Title block + tabs shared by the apartment pages (overview, gallery, availability, location). */
@Component({
  selector: 'app-apartment-header',
  imports: [DecimalPipe, RouterLink, RouterLinkActive],
  templateUrl: './apartment-header.html',
})
export class ApartmentHeader {
  readonly apartment = input.required<Apartment>();

  protected readonly tabs = [
    { label: 'Tổng quan', path: '/apartment' },
    { label: 'Hình ảnh', path: '/gallery' },
    { label: 'Lịch trống', path: '/availability' },
    { label: 'Vị trí', path: '/location' },
  ];
}
