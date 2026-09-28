import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SITE } from '../../data/site';

@Component({
  selector: 'app-about',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './about.html',
})
export class About {
  protected readonly site = SITE;

  protected readonly values = [
    {
      title: 'Không gian riêng tư',
      text: 'Căn góc tầng 4 rộng 78 m² với hai phòng ngủ, hai phòng tắm và ban công thoáng.',
    },
    {
      title: 'Giá minh bạch',
      text: 'Giá theo ngày trong tuần, cuối tuần và ngày lễ được hiển thị trước khi đặt phòng.',
    },
    {
      title: 'Hỗ trợ tận tâm',
      text: 'Chúng tôi luôn sẵn sàng qua điện thoại, Zalo và email, từ lúc đặt phòng đến khi bạn trả phòng.',
    },
  ];
}
