import { Component } from '@angular/core';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-contact-cards',
  template: `
    <div class="grid gap-6 md:grid-cols-3">
      @for (c of contact; track c.label) {
        <a [href]="c.href" class="card card-hover block text-center">
          <p class="small-caps text-accent-deep">{{ c.label }}</p>
          <p class="mt-3 font-serif text-xl break-words">{{ c.value }}</p>
        </a>
      }
    </div>
  `,
})
export class ContactCards {
  protected readonly contact = SITE.contact;
}
