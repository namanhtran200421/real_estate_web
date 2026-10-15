import { Component, computed, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavyBand } from '../../components/navy-band/navy-band';
import { SITE } from '../../data/site';
import { roomPhoto } from '../../data/sun-garden-rooms';
import { RevealDirective } from '../../motion/reveal.directive';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-about',
  imports: [NavyBand, NgOptimizedImage, RevealDirective, RouterLink, TranslocoPipe],
  templateUrl: './about.html',
  host: { class: 'block' },
})
export class About {
  protected readonly site = SITE;

  /** The one apartment this story is about. */
  private readonly apartments = inject(ApartmentService);
  protected readonly apartment = computed(() => this.apartments.resolve());

  protected readonly photo = computed(() => {
    const apt = this.apartment();
    return apt ? (roomPhoto(apt, '09') ?? apt.photos[0]) : undefined;
  });

  /** Translation keys under about.values (each has a title and a text). */
  protected readonly values = ['privacy', 'prices', 'support'].map((key) => `about.values.${key}`);
}
