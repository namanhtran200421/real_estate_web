import { Component, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-site-header',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
})
export class SiteHeader {
  protected readonly site = SITE;
  protected readonly menuOpen = signal(false);

  protected readonly links = [
    { label: 'Trang chủ', path: '/' },
    { label: 'Về chúng tôi', path: '/about' },
    { label: 'Liên hệ', path: '/contact' },
  ];
}
