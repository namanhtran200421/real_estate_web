import { createHash } from 'node:crypto';
import { HttpError } from '../../lib/http-error.js';
import { describeImage } from '../../lib/image.js';
import { apartmentPhotoRepository, type ApartmentPhotoFile } from './apartment-photo.repository.js';

export const MAX_APARTMENT_PHOTO_BYTES = 5 * 1024 * 1024;

/** Only static, bounded raster images become durable public listing assets. */
async function upload(data: unknown): Promise<{ src: string }> {
  if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'PHOTO_REQUIRED', 'Vui lòng chọn ảnh căn hộ.');
  if (data.length > MAX_APARTMENT_PHOTO_BYTES)
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Vui lòng chọn ảnh nhỏ hơn 5 MB.');
  const image = describeImage(data);
  if (!image) throw new HttpError(415, 'PHOTO_NOT_IMAGE', 'Vui lòng chọn ảnh JPG, PNG hoặc WebP hợp lệ.');
  if (
    image.width < 1 ||
    image.height < 1 ||
    image.width > 8192 ||
    image.height > 8192 ||
    image.width * image.height > 25_000_000
  ) {
    throw HttpError.unprocessable('PHOTO_DIMENSIONS_TOO_LARGE', 'Ảnh quá lớn. Vui lòng thu nhỏ ảnh rồi thử lại.');
  }
  const id = createHash('sha256').update(data).digest('hex');
  await apartmentPhotoRepository.save(id, {
    contentType: image.contentType,
    data,
  });
  return { src: `/api/v1/apartments/photos/${id}` };
}

async function get(id: string): Promise<ApartmentPhotoFile> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw HttpError.notFound('Không tìm thấy ảnh.');
  const photo = await apartmentPhotoRepository.find(id);
  if (!photo) throw HttpError.notFound('Không tìm thấy ảnh.');
  return photo;
}

export const apartmentPhotoService = { upload, get };
