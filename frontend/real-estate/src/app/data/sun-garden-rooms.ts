import { Apartment, Photo } from '../models/apartment';

/**
 * Which Sun Garden A04-12 photo shows which room, in tour order (the listing's captions are
 * generic). Photos are matched by file number, so the listing can reorder or drop photos.
 */
const SUN_GARDEN: { id: string; key: string; files: string[]; textOnly?: true }[] = [
  // 10 leads: it shows the kitchen corner and the front door.
  { id: 'phong-khach', key: 'living', files: ['10', '09', '02', '08'] },
  // The listing has no kitchen photo worth showing: the chapter is words only.
  { id: 'bep', key: 'kitchen', files: [], textOnly: true },
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
  /** A room with a title and a line but no photo (the kitchen): every layout must cope with `photos` being empty. */
  textOnly: boolean;
}

export function roomPhoto(apartment: Apartment, file: string): Photo | undefined {
  return apartment.photos.find((p) => p.src.endsWith(`/${file}.jpg`));
}

export function roomChapters(apartment: Apartment): RoomChapter[] {
  if (apartment.slug !== 'sun-garden-a04-12') return [{ id: 'hinh-anh', key: 'photos', photos: apartment.photos, textOnly: false }];
  return SUN_GARDEN.map(({ id, key, files, textOnly }) => ({
    id,
    key,
    photos: files.map((f) => roomPhoto(apartment, f)).filter((p): p is Photo => !!p),
    textOnly: !!textOnly,
  })).filter((chapter) => chapter.textOnly || chapter.photos.length > 0);
}

/** The room chapters plus a last one ("More views") for the photos no room claims, in file order. */
export function galleryChapters(apartment: Apartment): RoomChapter[] {
  const chapters = roomChapters(apartment);
  const cast = new Set(chapters.flatMap((c) => c.photos));
  const rest = apartment.photos.filter((p) => !cast.has(p)).sort((a, b) => a.src.localeCompare(b.src));
  return rest.length ? [...chapters, { id: 'them-anh', key: 'moreViews', photos: rest, textOnly: false }] : chapters;
}

/**
 * Alt text for photo `index` of a chapter: "<room title> – photo n of m". `translate` is Transloco's
 * (or a stub), so the title and the wording follow the page language. A plain apartment-photos
 * chapter keeps the listing's own alt.
 */
export function photoAlt(
  chapter: RoomChapter,
  index: number,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  const photo = chapter.photos[index];
  if (chapter.key === 'photos') return photo?.alt ?? '';
  return translate('rooms.photoAlt', {
    title: translate(`rooms.${chapter.key}.title`),
    n: index + 1,
    total: chapter.photos.length,
  });
}
