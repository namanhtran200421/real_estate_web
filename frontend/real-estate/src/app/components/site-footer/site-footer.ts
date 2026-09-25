import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  templateUrl: './site-footer.html',
})
export class SiteFooter {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();

  protected readonly links = [
    { label: 'Căn hộ', path: '/apartment' },
    { label: 'Lịch trống', path: '/availability' },
    { label: 'Đặt lịch', path: '/book' },
    { label: 'Tra cứu đặt phòng', path: '/booking/manage' },
    { label: 'Liên hệ', path: '/contact' },
  ];
}
