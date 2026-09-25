import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
})
export class SiteHeader {
  protected readonly site = SITE;
  protected readonly menuOpen = signal(false);

  // Apartment pages keep the current `?apt=` when navigating between them.
  protected readonly links = [
    { label: 'Trang chủ', path: '/', keepApt: false },
    { label: 'Căn hộ', path: '/apartment', keepApt: true },
    { label: 'Hình ảnh', path: '/gallery', keepApt: true },
    { label: 'Lịch trống', path: '/availability', keepApt: true },
    { label: 'Vị trí', path: '/location', keepApt: true },
    { label: 'Liên hệ', path: '/contact', keepApt: false },
  ];
}
