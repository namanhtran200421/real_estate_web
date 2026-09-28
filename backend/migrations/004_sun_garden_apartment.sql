-- Owner-provided listing and price sheet in the shared Drive folder (September 2026).
-- Keep old demo rows for historical booking foreign keys, but hide them from guests.
UPDATE apartments
SET is_active = false
WHERE slug IN ('can-ho-sen', 'can-ho-mai', 'can-ho-truc', 'can-ho-cuc');

INSERT INTO apartments (
  slug, name, area, address, map_query, tagline, description, photos,
  guests, bedrooms, beds, bathrooms, key_facilities, facilities, rules, nearby,
  check_in_time, check_out_time,
  price_weekday, price_weekend, price_holiday, price_weekly, price_monthly,
  long_stay_discounts, deposit_percent, is_active, sort_order
) VALUES (
  'sun-garden-a04-12',
  'Sammy APT · Sun Garden A04-12',
  'Nam Hồ · Đà Lạt',
  '2 đường Nam Hồ, Đà Lạt, Lâm Đồng',
  'Sun Garden, 2 Nam Hồ, Đà Lạt',
  'Căn góc tầng 4, 78 m² với 2 phòng ngủ và ban công nhìn về Xóm Lèo.',
  ARRAY[
    'Căn A04-12 tại Sun Garden Đà Lạt nằm ở tầng 4, tòa A. Căn góc hai mặt thoáng rộng 78 m², gồm 2 phòng ngủ và 2 phòng tắm.',
    'Ban công phòng khách nhìn về phía Xóm Lèo; ban công phòng ngủ nhìn ra đường Nam Hồ. Căn hộ có đầy đủ nội thất, Wi-Fi, bếp và máy giặt sấy. Không có điều hòa.',
    'Có khu vực đỗ ô tô và xe máy thu phí. Giá thuê tháng chưa bao gồm phí quản lý và phí đỗ xe.'
  ]::text[],
  '[{"src":"/apartments/sun-garden-a04-12/02.jpg","alt":"Phòng khách và khu ăn uống căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/04.jpg","alt":"Phòng khách với ban công tại căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/03.jpg","alt":"Phòng ngủ với giường và tủ tại Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/01.jpg","alt":"Bếp của căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/05.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/06.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/07.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/08.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/09.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/10.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/11.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/12.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/13.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/14.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/15.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"},{"src":"/apartments/sun-garden-a04-12/16.jpg","alt":"Ảnh thực tế căn hộ Sun Garden A04-12"}]'::jsonb,
  4, 2, 2, 2,
  ARRAY['Wi-Fi', 'Bếp từ', 'Máy giặt sấy', '2 phòng ngủ']::text[],
  ARRAY['Wi-Fi', 'TV cáp', 'Máy giặt sấy', 'Tủ lạnh', 'Bếp từ', 'Ấm đun nước', 'Lò vi sóng', 'Quạt trần', 'Quạt cây', 'Ban công', 'Bình nóng lạnh', 'Chỗ đỗ xe thu phí']::text[],
  ARRAY[]::text[],
  '[{"place":"Quảng trường Lâm Viên","distance":"11 phút đi ô tô · 4,9 km"},{"place":"Tiệm nướng Xóm Lèo","distance":"6 phút đi ô tô · 3,1 km"},{"place":"Chợ đêm Đà Lạt","distance":"13 phút đi ô tô · 5,7 km"},{"place":"Thung lũng Tình Yêu","distance":"14 phút đi ô tô · 7,2 km"},{"place":"Đồi chè Cầu Đất","distance":"32 phút đi ô tô · 19,2 km"}]'::jsonb,
  '14:00', '12:00',
  1700000, 1850000, 3190000, 10250000, 15000000,
  '[{"nights":2,"percent":3},{"nights":3,"percent":5},{"nights":4,"percent":7},{"nights":5,"percent":9},{"nights":6,"percent":11},{"nights":7,"percent":15}]'::jsonb,
  30, true, 0
)
ON CONFLICT (slug) DO NOTHING;
