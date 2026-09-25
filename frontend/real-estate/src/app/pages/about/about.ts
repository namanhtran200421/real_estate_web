import { Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site';
import { ApartmentService } from '../../services/apartment.service';

// Placeholder copy. Replace with the owner's real story.
@Component({
  selector: 'app-about',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './about.html',
})
export class About {
  protected readonly site = SITE;
  protected readonly apartments = inject(ApartmentService).all;

  protected readonly values = [
    {
      title: 'Chọn lọc kỹ lưỡng',
      text: 'Mỗi căn hộ đều được chúng tôi trực tiếp kiểm tra về vị trí, tiện nghi và độ sạch sẽ trước khi đón khách.',
    },
    {
      title: 'Giá minh bạch',
      text: 'Giá được tính tự động theo ngày bạn chọn và hiển thị đầy đủ trước khi thanh toán. Không có phí ẩn.',
    },
    {
      title: 'Hỗ trợ tận tâm',
      text: 'Chúng tôi luôn sẵn sàng qua điện thoại, Zalo và email, từ lúc đặt phòng đến khi bạn trả phòng.',
    },
  ];
}
