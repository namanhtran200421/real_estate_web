import { Apartment } from '../models/apartment';

/** Owner listing copy for the English storefront. Booking data and prices remain API-owned. */
export function localizeSunGarden(apartment: Apartment): Apartment {
  if (apartment.slug !== 'sun-garden-a04-12') return apartment;

  return {
    ...apartment,
    name: 'Sun Garden apartment A04-12',
    area: 'Nam Ho · Da Lat',
    address: '2 Nam Ho Street, Da Lat, Lam Dong',
    tagline: 'Fourth-floor corner apartment, 78 m², with two bedrooms and a balcony overlooking Xom Leo.',
    description: [
      'Apartment A04-12 is on the fourth floor of building A at Sun Garden Da Lat. This airy 78 m² corner apartment has two bedrooms and two bathrooms.',
      'The living-room balcony overlooks Xom Leo, while the bedroom balcony faces Nam Ho Street. The apartment is fully furnished, with Wi-Fi, a kitchen and a washer-dryer. There is no air conditioning.',
      'Paid car and motorbike parking is available. Monthly rent does not include management or parking fees.',
    ],
    photos: apartment.photos.map((photo, index) => ({
      ...photo,
      alt: [
        'Living and dining area of Sun Garden apartment A04-12',
        'Living room and balcony at Sun Garden apartment A04-12',
        'Bedroom with bed and wardrobe at Sun Garden A04-12',
        'Kitchen of Sun Garden apartment A04-12',
      ][index] ?? `Sun Garden apartment A04-12, photo ${index + 1}`,
    })),
    keyFacilities: [
      'Two-bedroom apartment', 'Fully furnished', 'Fully equipped private kitchen',
      'Two private bathrooms', 'Free Wi-Fi', 'Washer and dryer',
    ],
    facilities: [
      'Hot water', 'Shower', 'Complimentary toiletries', 'Toilet paper',
      'Sofa', 'Desk', 'Flat-screen TV', 'Ceiling fan',
      'Refrigerator', 'Double induction hob', 'Extractor hood', 'Tableware', 'Cookware', 'Electric kettle',
      'Large double bed', 'Bedding', 'Wardrobe', 'Clothes rack', 'Standing fan',
      'Washer and dryer', 'Drying rack', 'Hangers', 'Four pairs of slippers', 'Free Wi-Fi',
      'Lift', 'Fire extinguisher', 'Paid parking', 'No pets', 'Smoke alarm',
    ],
    rules: ['No pets'],
    nearby: [
      { place: 'Túi Mơ To restaurant', distance: '3 min by car · 1.3 km' },
      { place: 'Dốc Thị café', distance: '4 min by car · 1.1 km' },
      { place: 'Xóm Lèo grill', distance: '6 min by car · 3.1 km' },
      { place: 'Lang Thang Cloud Hill', distance: '7 min by car · 2.7 km' },
      { place: 'Lâm Viên Square', distance: '11 min by car · 4.9 km' },
      { place: 'Da Lat Night Market', distance: '13 min by car · 5.7 km' },
      { place: 'Valley of Love', distance: '14 min by car · 7.2 km' },
    ],
  };
}
