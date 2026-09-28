# Sun Garden A04-12 content sources

The public listing in `migrations/004_sun_garden_apartment.sql` uses the owner's [shared Drive folder](https://drive.google.com/drive/folders/1YmiLD-E5K4H6I3xs4IRzN7nRHOgV6Y74). The 16 photos were copied from its [apartment photos folder](https://drive.google.com/drive/folders/1Zm7SjqYtJsG6NmCqxMZy4hiS58cBoiKr) to the frontend's public assets so the site does not depend on Drive thumbnail URLs at runtime.

| Data | Source |
| --- | --- |
| Address, layout, views, parking and nearby places | [Thông Tin Cơ Bản](https://docs.google.com/document/d/1aq-GIE8l0hqeUDOnfCi3Ac2wb9Qj7hhPZSyStEC1HoM/edit) |
| Equipment and amenities | [Equipment List](https://docs.google.com/document/d/1zhdAr2Qjug_mxNAdEBF5FiIOqid4DqwLWLmdYOlMU3E/edit) |
| Nightly, weekly, monthly and holiday prices; stay discounts | [Bảng giá](https://drive.google.com/file/d/1DGhIZU1tBeWVXEXmv297D1E6GV92163G/view) |
| Public contact details | Basic information and price sheet above |

The owner subsequently supplied **Danh Sách sửa content Website.pdf** (September 2026). Its content changes are recorded in `migrations/007_website_content_updates.sql`: monthly rent 22,000,000 ₫, the expanded amenity list, and nearby places. The document also changes the public phone and email shown in the frontend. Its review image is a layout reference, not a review of Sun Garden A04-12; publish only actual guest reviews for this apartment.

The price sheet uses “Sammy APT” for the apartment flyer. The website name remains “VN Booking Hub.”

The source files do not specify maximum guests, bed count, check-in/out times or deposit policy. The listing currently uses the app's booking defaults: 4 guests, 2 beds, 14:00 check-in, 12:00 check-out and a 30% deposit. The owner allowed these defaults for now. No dates are blocked without a real availability source.

The Drive folder contains no payment gateway credentials or integration details. The existing VietQR bank transfer workflow remains in place, with owner confirmation after receiving funds.
