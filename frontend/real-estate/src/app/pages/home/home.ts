import { Component, computed, inject } from '@angular/core';
import { ApartmentCard } from '../../components/apartment-card/apartment-card';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-home',
  imports: [ApartmentCard],
  templateUrl: './home.html',
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  /** The first apartment gets the wide featured card; the rest go in the grid. */
  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  protected readonly promises = [
    {
      title: 'Lịch trống cập nhật liên tục',
      text: 'Xem ngày còn trống và đặt ngay, không cần nhắn tin hỏi trước.',
    },
    {
      title: 'Giá rõ ràng',
      text: 'Giá được tính tự động theo ngày và hiển thị đầy đủ trước khi thanh toán.',
    },
    {
      title: 'Thanh toán trực tuyến',
      text: 'Đặt cọc hoặc thanh toán toàn bộ, nhận xác nhận qua email.',
    },
  ];
}
