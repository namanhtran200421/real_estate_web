import { Apartment, Photo } from '../models/apartment';

/**
 * Which Sun Garden A04-12 photo shows which room, in tour order (the listing's captions are
 * generic). Photos are matched by file number, so the listing can reorder or drop photos.
 */
const SUN_GARDEN: { id: string; key: string; files: string[]; textOnly?: true }[] = [
  // 10 leads: it shows the kitchen corner and the front door.
  { id: 'phong-khach', key: 'living', files: ['10', '09', '02', '08'] },
  // 01 is the one kitchen photo (the owner's choice: use it). Text-only chapters stay supported.
  { id: 'bep', key: 'kitchen', files: ['01'] },
  { id: 'phong-tam', key: 'bathrooms', files: ['11', '12'] },
  { id: 'phong-ngu-1', key: 'bedroom1', files: ['13', '14'] },
  { id: 'phong-ngu-2', key: 'bedroom2', files: ['16', '15', '03'] },
];

/** The Sun Garden photos shot in landscape (4:3); all the others are portrait (3:4). */
const SUN_GARDEN_LANDSCAPE = new Set(['06', '07', '08', '09', '10']);

/** Whether a photo is portrait (3:4), so a frame can fit it without cutting it off. Other apartments' photos count as landscape. */
export function isPortrait(photo: Photo): boolean {
  const file = /\/sun-garden-a04-12\/(\d+)\.jpg$/.exec(photo.src)?.[1];
  return !!file && !SUN_GARDEN_LANDSCAPE.has(file);
}

export interface RoomChapter {
  /** Fragment id on the apartment page, e.g. "phong-ngu-2". */
  id: string;
  /** Translation key under `rooms.` (title and one line). */
  key: string;
  photos: Photo[];
  /** A room with a title and a line but no photo: every layout must cope with `photos` being empty. */
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

/**
 * The room chapters plus a last one ("More views") for the photos no room claims, in file order.
 * After each chapter's lead photo, landscape photos come before portrait ones, so the gallery's
 * two-up rows pair photos of one shape and the odd one out is the full-width last.
 */
export function galleryChapters(apartment: Apartment): RoomChapter[] {
  const rooms = roomChapters(apartment);
  const cast = new Set(rooms.flatMap((c) => c.photos));
  const rest = apartment.photos.filter((p) => !cast.has(p)).sort((a, b) => a.src.localeCompare(b.src));
  const chapters = rest.length ? [...rooms, { id: 'them-anh', key: 'moreViews', photos: rest, textOnly: false }] : rooms;
  return chapters.map((chapter) => {
    const [lead, ...others] = chapter.photos;
    if (!others.length) return chapter;
    return { ...chapter, photos: [lead, ...others.filter((p) => !isPortrait(p)), ...others.filter(isPortrait)] };
  });
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
