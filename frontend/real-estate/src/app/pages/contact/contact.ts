import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Select, SelectOption } from '../../components/select/select';
import { SITE } from '../../data/site';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-contact',
  imports: [RouterLink, Select],
  templateUrl: './contact.html',
})
export class Contact {
  protected readonly contact = SITE.contact;
  private readonly apartments = inject(ApartmentService).all;

  protected readonly topicOptions: SelectOption[] = [
    'Đặt phòng',
    'Thông tin căn hộ',
    'Thanh toán',
    'Hợp tác cho thuê',
    'Khác',
  ].map((t) => ({ value: t, label: t }));

  protected readonly apartmentOptions = computed<SelectOption[]>(() =>
    this.apartments().map((a) => ({ value: a.slug, label: a.name })),
  );
}
