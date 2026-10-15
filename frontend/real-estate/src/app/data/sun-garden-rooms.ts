import { Apartment, Photo } from '../models/apartment';

/**
 * Which Sun Garden A04-12 photo shows which room, in tour order (the listing's captions are
 * generic). Photos are matched by file number, so the listing can reorder or drop photos.
 */
const SUN_GARDEN: { id: string; key: string; files: string[] }[] = [
  { id: 'phong-khach', key: 'living', files: ['02', '06', '09', '10'] },
  { id: 'bep', key: 'kitchen', files: ['01', '08'] },
  { id: 'phong-tam', key: 'bathrooms', files: ['11', '12'] },
  { id: 'phong-ngu-1', key: 'bedroom1', files: ['13', '14'] },
  { id: 'phong-ngu-2', key: 'bedroom2', files: ['16', '15', '03'] },
];

export interface RoomChapter {
  /** Fragment id on the apartment page, e.g. "phong-ngu-2". */
  id: string;
  /** Translation key under `rooms.` (title and one line). */
  key: string;
  photos: Photo[];
}

export function roomPhoto(apartment: Apartment, file: string): Photo | undefined {
  return apartment.photos.find((p) => p.src.endsWith(`/${file}.jpg`));
}

export function roomChapters(apartment: Apartment): RoomChapter[] {
  if (apartment.slug !== 'sun-garden-a04-12') return [{ id: 'hinh-anh', key: 'photos', photos: apartment.photos }];
  return SUN_GARDEN.map(({ id, key, files }) => ({
    id,
    key,
    photos: files.map((f) => roomPhoto(apartment, f)).filter((p): p is Photo => !!p),
  })).filter((chapter) => chapter.photos.length > 0);
}

/** The room chapters plus a last one for the photos no room claims (the page heroes), in listing order. */
export function galleryChapters(apartment: Apartment): RoomChapter[] {
  const chapters = roomChapters(apartment);
  const cast = new Set(chapters.flatMap((c) => c.photos));
  const rest = apartment.photos.filter((p) => !cast.has(p));
  return rest.length ? [...chapters, { id: 'them-anh', key: 'photos', photos: rest }] : chapters;
}
