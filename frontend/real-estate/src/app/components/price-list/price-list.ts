import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Pricing } from '../../models/apartment';

@Component({
  selector: 'app-price-list',
  imports: [DecimalPipe],
  templateUrl: './price-list.html',
})
export class PriceList {
  readonly pricing = input.required<Pricing>();

  protected readonly rows = computed(() => {
    const p = this.pricing();
    return [
      { label: 'Thứ Hai – Thứ Năm', amount: p.weekday, unit: '/ đêm' },
      { label: 'Thứ Sáu – Chủ Nhật', amount: p.weekend, unit: '/ đêm' },
      { label: 'Ngày lễ', amount: p.holiday, unit: '/ đêm' },
      { label: 'Theo tuần', amount: p.weekly, unit: '/ tuần' },
      { label: 'Theo tháng', amount: p.monthly, unit: '/ tháng' },
    ];
  });
}
