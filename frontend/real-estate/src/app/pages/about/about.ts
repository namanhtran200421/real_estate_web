import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-about',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './about.html',
})
export class About {
  protected readonly site = SITE;

  /** Translation keys under about.values (each has a title and a text). */
  protected readonly values = ['privacy', 'prices', 'support'].map((key) => `about.values.${key}`);
}
