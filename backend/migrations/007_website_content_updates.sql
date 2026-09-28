-- Owner-requested website content updates (September 2026).
-- Preserve names, photos and any other fields edited since the initial listing was seeded.
UPDATE apartments
SET price_monthly = 22000000,
    key_facilities = ARRAY[
      'Căn hộ 2 phòng ngủ', 'Đầy đủ nội thất', 'Bếp riêng đầy đủ tiện nghi',
      '2 phòng tắm riêng', 'Wi-Fi miễn phí', 'Máy giặt & sấy'
    ]::text[],
    facilities = ARRAY[
      'Máy nóng lạnh', 'Vòi sen', 'Đồ vệ sinh cá nhân miễn phí', 'Giấy vệ sinh',
      'Sofa', 'Bàn làm việc', 'TV màn hình phẳng', 'Quạt trần',
      'Tủ lạnh', 'Bếp từ đôi', 'Máy hút mùi', 'Bộ bát đũa', 'Dụng cụ nấu ăn', 'Ấm siêu tốc',
      'Giường đôi lớn', 'Bộ chăn, ga, gối, đệm', 'Tủ để quần áo', 'Giá treo', 'Quạt cây',
      'Máy giặt / sấy', 'Giá phơi đồ', 'Móc treo đồ', 'Dép lê (4 đôi)', 'Wi-Fi miễn phí',
      'Thang máy', 'Bình chữa cháy', 'Chỗ đậu xe (có phí)', 'Không vật nuôi',
      'Thiết bị báo cháy'
    ]::text[],
    rules = ARRAY['Không vật nuôi']::text[],
    nearby = '[
      {"place":"Nhà hàng Túi Mơ To","distance":"3 phút đi ô tô · 1,3 km"},
      {"place":"Tiệm Cafe Dốc Thị","distance":"4 phút đi ô tô · 1,1 km"},
      {"place":"Tiệm nướng Xóm Lèo","distance":"6 phút đi ô tô · 3,1 km"},
      {"place":"Đồi mây Lang Thang","distance":"7 phút đi ô tô · 2,7 km"},
      {"place":"Quảng trường Lâm Viên","distance":"11 phút đi ô tô · 4,9 km"},
      {"place":"Chợ đêm Đà Lạt","distance":"13 phút đi ô tô · 5,7 km"},
      {"place":"Thung lũng Tình Yêu","distance":"14 phút đi ô tô · 7,2 km"}
    ]'::jsonb
WHERE slug = 'sun-garden-a04-12';
