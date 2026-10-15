import { Apartment } from '../models/apartment';
import { roomChapters, roomPhoto } from './sun-garden-rooms';

const photo = (n: string) => ({ src: `/apartments/sun-garden-a04-12/${n}.jpg`, alt: `Ảnh ${n}` });
const sunGarden = {
  slug: 'sun-garden-a04-12',
  photos: ['02', '04', '03', '01', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'].map(photo),
} as Apartment;

describe('room chapters', () => {
  it('casts Sun Garden photos into five chapters in tour order', () => {
    const chapters = roomChapters(sunGarden);
    expect(chapters.map((c) => c.id)).toEqual(['phong-khach', 'bep', 'phong-tam', 'phong-ngu-1', 'phong-ngu-2']);
    expect(chapters.map((c) => c.photos.map((p) => p.src.slice(-6, -4)))).toEqual([
      ['02', '06', '09', '10'],
      ['01', '08'],
      ['11', '12'],
      ['13', '14'],
      ['16', '15', '03'],
    ]);
  });

  it('skips photos the listing no longer has', () => {
    const fewer = { ...sunGarden, photos: sunGarden.photos.filter((p) => !p.src.endsWith('/08.jpg')) } as Apartment;
    expect(roomChapters(fewer)[1].photos.map((p) => p.src.slice(-6, -4))).toEqual(['01']);
  });

  it('gives any other apartment a single chapter with all its photos', () => {
    const other = { slug: 'other', photos: [photo('a'), photo('b')] } as Apartment;
    expect(roomChapters(other)).toEqual([{ id: 'hinh-anh', key: 'photos', photos: other.photos }]);
  });

  it('finds a photo by file number', () => {
    expect(roomPhoto(sunGarden, '05')?.src).toBe('/apartments/sun-garden-a04-12/05.jpg');
    expect(roomPhoto(sunGarden, '99')).toBeUndefined();
  });
});
