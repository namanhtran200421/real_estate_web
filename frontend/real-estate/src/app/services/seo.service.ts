import { DOCUMENT, Injectable, REQUEST, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE } from '../data/site';
import { socialImage } from '../image-loader';
import { Apartment } from '../models/apartment';

export interface SeoData {
  title: string;
  description?: string;
  /** Site-relative path including any `?apt=`; used for canonical + og:url. */
  path: string;
  image?: string;
  robots?: string;
  jsonLd?: object;
}

/** Keeps <title>, meta description, canonical, Open Graph and JSON-LD in sync (server + browser). */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  update(data: SeoData): void {
    const description = data.description ?? SITE.description;
    const url = this.origin() + data.path;
    const image = socialImage(data.image ?? SITE.defaultImage);

    this.title.setTitle(data.title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: data.robots ?? 'index, follow' });

    this.meta.updateTag({ property: 'og:title', content: data.title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: data.title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
    this.setJsonLd(data.jsonLd);
  }

  /** Apartment pages: title, description, cover photo and schema.org data from the apartment. */
  updateForApartment(apt: Apartment, page: { label: string; path: string }): void {
    const price = new Intl.NumberFormat('vi-VN').format(apt.pricing.weekday);
    this.update({
      title: `${page.label === 'Tổng quan' ? apt.name : `${page.label} · ${apt.name}`} · ${SITE.name}`,
      description: `${apt.tagline} ${apt.bedrooms} phòng ngủ, tối đa ${apt.guests} khách, từ ${price} ₫/đêm. ${apt.area}.`,
      path: `${page.path}?apt=${apt.slug}`,
      image: apt.photos[0]?.src,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Apartment',
        name: apt.name,
        description: apt.description.join(' '),
        url: `${this.origin()}/apartment?apt=${apt.slug}`,
        image: apt.photos.map((p) => socialImage(p.src)),
        numberOfRooms: apt.bedrooms,
        numberOfBedrooms: apt.bedrooms,
        numberOfBathroomsTotal: apt.bathrooms,
        occupancy: { '@type': 'QuantitativeValue', maxValue: apt.guests },
        address: {
          '@type': 'PostalAddress',
          streetAddress: apt.address,
          addressRegion: 'TP. Hồ Chí Minh',
          addressCountry: 'VN',
        },
        amenityFeature: apt.facilities.map((name) => ({
          '@type': 'LocationFeatureSpecification',
          name,
          value: true,
        })),
      },
    });
  }

  private origin(): string {
    return this.request ? new URL(this.request.url).origin : this.document.location.origin;
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }

  private setJsonLd(data?: object): void {
    let script = this.document.head.querySelector<HTMLScriptElement>('script#structured-data');
    if (!data) {
      script?.remove();
      return;
    }
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'structured-data';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    // Escape "<" so data can never close the <script> tag.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  }
}
