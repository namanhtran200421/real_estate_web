import { Apartment } from '../models/apartment';
import { galleryChapters, photoAlt, roomChapters, roomPhoto } from './sun-garden-rooms';

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
      ['10', '09', '02', '08'],
      ['01'],
      ['11', '12'],
      ['13', '14'],
      ['16', '15', '03'],
    ]);
  });

  it('shows the one kitchen photo, 01, and no chapter is text-only', () => {
    const chapters = roomChapters(sunGarden);
    expect(chapters.map((c) => c.textOnly)).toEqual([false, false, false, false, false]);
    expect(chapters[1].key).toBe('kitchen');
    expect(chapters[1].photos.map((p) => p.src.slice(-6, -4))).toEqual(['01']);
  });

  it('skips photos the listing no longer has', () => {
    const fewer = { ...sunGarden, photos: sunGarden.photos.filter((p) => !p.src.endsWith('/08.jpg')) } as Apartment;
    expect(roomChapters(fewer)[0].photos.map((p) => p.src.slice(-6, -4))).toEqual(['10', '09', '02']);
  });

  it('drops a chapter the listing has no photos for', () => {
    const none = { slug: 'sun-garden-a04-12', photos: [photo('11'), photo('12')] } as Apartment;
    expect(roomChapters(none).map((c) => c.id)).toEqual(['phong-tam']);
  });

  it('gives any other apartment a single chapter with all its photos', () => {
    const other = { slug: 'other', photos: [photo('a'), photo('b')] } as Apartment;
    expect(roomChapters(other)).toEqual([{ id: 'hinh-anh', key: 'photos', photos: other.photos, textOnly: false }]);
  });

  it('finds a photo by file number', () => {
    expect(roomPhoto(sunGarden, '05')?.src).toBe('/apartments/sun-garden-a04-12/05.jpg');
    expect(roomPhoto(sunGarden, '99')).toBeUndefined();
  });
});

describe('gallery chapters', () => {
  it('adds the uncast photos as a last chapter, so every Sun Garden photo shows exactly once', () => {
    const chapters = galleryChapters(sunGarden);
    expect(chapters.map((c) => c.id)).toEqual(['phong-khach', 'bep', 'phong-tam', 'phong-ngu-1', 'phong-ngu-2', 'them-anh']);
    const last = chapters[chapters.length - 1];
    expect(last.key).toBe('moreViews');
    expect(last.textOnly).toBe(false);
    expect(last.photos.map((p) => p.src.slice(-6, -4))).toEqual(['04', '05', '06', '07']);
    const shown = chapters.flatMap((c) => c.photos).map((p) => p.src).sort();
    expect(shown).toHaveLength(16);
    expect(shown).toEqual(sunGarden.photos.map((p) => p.src).sort());
    expect(new Set(shown).size).toBe(16);
  });

  it('adds no extra chapter when every photo is already in one', () => {
    const other = { slug: 'other', photos: [photo('a'), photo('b')] } as Apartment;
    expect(galleryChapters(other)).toEqual(roomChapters(other));
  });
});

describe('photo alt text', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    key === 'rooms.photoAlt' ? `${params?.['title']} – ảnh ${params?.['n']}/${params?.['total']}` : `[${key}]`;

  it('names the room and the photo position, using the translated title', () => {
    const living = roomChapters(sunGarden)[0];
    expect(photoAlt(living, 0, t)).toBe('[rooms.living.title] – ảnh 1/4');
    expect(photoAlt(living, 3, t)).toBe('[rooms.living.title] – ảnh 4/4');
  });

  it('keeps the listing alt for a chapter that is just the apartment photos', () => {
    const other = { slug: 'other', photos: [photo('a'), photo('b')] } as Apartment;
    expect(photoAlt(roomChapters(other)[0], 1, t)).toBe('Ảnh b');
  });
});
