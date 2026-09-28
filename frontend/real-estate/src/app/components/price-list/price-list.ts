import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Pricing } from '../../models/apartment';

@Component({
  selector: 'app-price-list',
  imports: [DecimalPipe, TranslocoPipe],
  templateUrl: './price-list.html',
})
export class PriceList {
  readonly pricing = input.required<Pricing>();

  /** `label` and `unit` are translation keys. */
  protected readonly rows = computed(() => {
    const p = this.pricing();
    return [
      { label: 'prices.weekday', amount: p.weekday, unit: 'common.perNight' },
      { label: 'prices.weekend', amount: p.weekend, unit: 'common.perNight' },
      { label: 'prices.holiday', amount: p.holiday, unit: 'common.perNight' },
      { label: 'prices.weekly', amount: p.weekly, unit: 'prices.perWeek' },
      { label: 'prices.monthly', amount: p.monthly, unit: 'prices.perMonth' },
    ];
  });
}
