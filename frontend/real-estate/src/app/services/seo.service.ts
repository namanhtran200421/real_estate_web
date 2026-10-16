import { DOCUMENT, Injectable, InjectionToken, LOCALE_ID, REQUEST, inject } from '@angular/core';
import { formatNumber } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { SITE } from '../data/site';
import { LANG } from '../i18n/i18n';
import { LANGS, withLangPrefix } from '../i18n/lang';
import { socialImage } from '../image-loader';
import { Apartment } from '../models/apartment';

/** Canonical public origin supplied by the server in production; empty in the browser by default. */
export const SITE_ORIGIN = new InjectionToken<string>('SITE_ORIGIN', {
  providedIn: 'root',
  factory: () => '',
});

export interface SeoData {
  title: string;
  description?: string;
  /** Site-relative path including any `?apt=`, without the language prefix; used for canonical + og:url. */
  path: string;
  image?: string;
  robots?: string;
  jsonLd?: object;
}

const OG_LOCALES = { vi: 'vi_VN', en: 'en_US' } as const;

/**
 * Keeps <title>, meta description, canonical, language alternates, Open Graph and JSON-LD in sync
 * (server + browser).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly siteOrigin = inject(SITE_ORIGIN);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = inject(LANG);
  private readonly locale = inject(LOCALE_ID);

  update(data: SeoData): void {
    const description: string = data.description ?? this.transloco.translate('site.description');
    const url = this.origin() + withLangPrefix(this.lang, data.path);
    const image = new URL(socialImage(data.image ?? SITE.defaultImage), this.origin()).href;

    this.title.setTitle(data.title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: data.robots ?? 'index, follow' });

    this.meta.updateTag({ property: 'og:title', content: data.title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:locale', content: OG_LOCALES[this.lang] });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:alt', content: data.title });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:locale:alternate', content: OG_LOCALES[this.lang === 'vi' ? 'en' : 'vi'] });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: data.title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    this.meta.updateTag({ name: 'twitter:image:alt', content: data.title });

    this.setCanonical(url);
    this.setAlternates(data.path);
    this.setJsonLd(this.enrichWebsiteSchema(data.jsonLd, url));
  }

  /**
   * Apartment pages: title, description, cover photo and schema.org data from the apartment.
   * `page.label` is the translation key of the tab; the overview page is titled by the apartment alone.
   */
  updateForApartment(apt: Apartment, page: { label: string; path: string }): void {
    const name = page.path === '/apartment' ? apt.name : `${this.transloco.translate(page.label)} · ${apt.name}`;
    const apartmentUrl = `${this.origin()}${withLangPrefix(this.lang, '/apartment')}?apt=${apt.slug}`;
    const pageUrl = `${this.origin()}${withLangPrefix(this.lang, page.path)}?apt=${apt.slug}`;
    const images = apt.photos.map((photo) => new URL(socialImage(photo.src), this.origin()).href);
    const floorSize = Number.parseFloat(apt.area);
    this.update({
      title: `${name} · ${SITE.name}`,
      description: this.transloco.translate('meta.apartment', {
        tagline: apt.tagline,
        bedrooms: apt.bedrooms,
        guests: apt.guests,
        price: formatNumber(apt.pricing.weekday, this.locale),
        area: apt.area,
      }),
      path: `${page.path}?apt=${apt.slug}`,
      image: apt.photos[0]?.src,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Apartment',
            '@id': `${apartmentUrl}#apartment`,
            name: apt.name,
            description: apt.description.join(' '),
            url: apartmentUrl,
            mainEntityOfPage: pageUrl,
            image: images,
            numberOfBedrooms: apt.bedrooms,
            numberOfBathroomsTotal: apt.bathrooms,
            ...(Number.isFinite(floorSize)
              ? { floorSize: { '@type': 'QuantitativeValue', value: floorSize, unitCode: 'MTK' } }
              : {}),
            occupancy: { '@type': 'QuantitativeValue', maxValue: apt.guests },
            address: {
              '@type': 'PostalAddress',
              streetAddress: apt.address,
              addressLocality: 'Đà Lạt',
              addressRegion: 'Lâm Đồng',
              addressCountry: 'VN',
            },
            amenityFeature: apt.facilities.map((facility) => ({
              '@type': 'LocationFeatureSpecification',
              name: facility,
              value: true,
            })),
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: Math.min(apt.pricing.weekday, apt.pricing.weekend, apt.pricing.holiday),
              highPrice: Math.max(apt.pricing.weekday, apt.pricing.weekend, apt.pricing.holiday),
              priceCurrency: 'VND',
              offerCount: 1,
              url: `${this.origin()}${withLangPrefix(this.lang, '/availability')}?apt=${apt.slug}`,
            },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: SITE.name, item: this.origin() + withLangPrefix(this.lang, '/') },
              { '@type': 'ListItem', position: 2, name: apt.name, item: apartmentUrl },
              ...(page.path === '/apartment'
                ? []
                : [{ '@type': 'ListItem', position: 3, name: this.transloco.translate(page.label), item: pageUrl }]),
            ],
          },
        ],
      },
    });
  }

  /** Adds stable site identity to the home page's WebSite schema without duplicating it per route. */
  private enrichWebsiteSchema(data: object | undefined, url: string): object | undefined {
    if (!data || (data as { '@type'?: string })['@type'] !== 'WebSite') return data;
    const origin = this.origin();
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          ...data,
          '@context': undefined,
          '@id': `${origin}/#website`,
          url,
          publisher: { '@id': `${origin}/#organization` },
        },
        {
          '@type': 'Organization',
          '@id': `${origin}/#organization`,
          name: SITE.name,
          url: origin,
          logo: new URL('/brand/logo-stacked.png', origin).href,
          email: 'vnbookinghub@gmail.com',
          telephone: '+84 869 141 104',
        },
      ],
    };
  }

  private origin(): string {
    return this.siteOrigin || (this.request ? new URL(this.request.url).origin : this.document.location.origin);
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

  /** The same page in every language (hreflang), Vietnamese being the default for other languages. */
  private setAlternates(path: string): void {
    const head = this.document.head;
    head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => link.remove());
    for (const lang of [...LANGS, 'x-default'] as const) {
      const link = this.document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = lang;
      link.href = this.origin() + withLangPrefix(lang === 'x-default' ? 'vi' : lang, path);
      head.appendChild(link);
    }
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
