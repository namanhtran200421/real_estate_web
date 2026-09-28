import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './site-footer.html',
})
export class SiteFooter {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();

  /** `label` is a translation key. */
  protected readonly links = [
    { label: 'nav.about', path: '/about' },
    { label: 'nav.apartment', path: '/apartment' },
    { label: 'nav.availability', path: '/availability' },
    { label: 'nav.book', path: '/book' },
    { label: 'nav.lookup', path: '/booking/manage' },
    { label: 'nav.contact', path: '/contact' },
  ];
}
