import { query, queryOne } from '../../db/pool.js';
import type { ImageType } from '../../lib/image.js';

export interface ApartmentPhotoFile {
  contentType: ImageType;
  data: Buffer;
}

export const apartmentPhotoRepository = {
  async save(id: string, photo: ApartmentPhotoFile): Promise<void> {
    await query(
      'INSERT INTO apartment_photos (id, content_type, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [id, photo.contentType, photo.data],
    );
  },
  find(id: string): Promise<ApartmentPhotoFile | undefined> {
    return queryOne<ApartmentPhotoFile>(
      'SELECT content_type AS "contentType", data FROM apartment_photos WHERE id = $1',
      [id],
    );
  },
};
