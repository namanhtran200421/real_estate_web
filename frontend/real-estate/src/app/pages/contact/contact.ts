import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-contact',
  imports: [RouterLink],
  templateUrl: './contact.html',
})
export class Contact {
  protected readonly contact = SITE.contact;
  protected readonly apartments = inject(ApartmentService).all;

  protected readonly topics = ['Đặt phòng', 'Thông tin căn hộ', 'Thanh toán', 'Hợp tác cho thuê', 'Khác'];
}
