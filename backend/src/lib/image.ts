/** Shared bounded container inspection for uploaded raster images. No decoding or OCR. */
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

function startsWith(data: Buffer, signature: string, offset = 0): boolean {
  return data.subarray(offset, offset + signature.length).toString('latin1') === signature;
}

interface ImageDescription {
  contentType: ImageType;
  width: number;
  height: number;
}

function pngDescription(data: Buffer): ImageDescription | undefined {
  if (!startsWith(data, '\x89PNG\r\n\x1a\n') || data.length < 45) return undefined;
  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let sawImageData = false;

  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) return undefined;
    const type = data.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return undefined;

    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) return undefined;
      width = data.readUInt32BE(offset + 8);
      height = data.readUInt32BE(offset + 12);
      const bitDepth = data[offset + 16];
      const colourType = data[offset + 17];
      const validDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !validDepths[colourType]?.includes(bitDepth) ||
        data[offset + 18] !== 0 ||
        data[offset + 19] !== 0 ||
        data[offset + 20] > 1
      ) {
        return undefined;
      }
    } else if (type === 'IHDR') {
      return undefined;
    }

    if (type === 'IDAT') sawImageData = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== data.length || !sawImageData || width === undefined || height === undefined)
        return undefined;
      return { contentType: 'image/png', width, height };
    }
    offset = end;
  }
  return undefined;
}

const JPEG_START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegDescription(data: Buffer): ImageDescription | undefined {
  if (!startsWith(data, '\xff\xd8') || data.length < 14 || !startsWith(data, '\xff\xd9', data.length - 2))
    return undefined;
  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;

  // Dimensions occur before the first scan. Validate every length-delimited header on the way.
  while (offset + 4 <= data.length - 2) {
    if (data[offset] !== 0xff) return undefined;
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xda) break; // Start of scan; compressed bytes continue until the final EOI.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length - 2) return undefined;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length - 2) return undefined;
    if (JPEG_START_OF_FRAME.has(marker)) {
      if (length < 8) return undefined;
      height = data.readUInt16BE(offset + 3);
      width = data.readUInt16BE(offset + 5);
    }
    offset += length;
  }
  if (width === undefined || height === undefined) return undefined;
  return { contentType: 'image/jpeg', width, height };
}

function uint24LE(data: Buffer, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function webpDescription(data: Buffer): ImageDescription | undefined {
  if (!startsWith(data, 'RIFF') || !startsWith(data, 'WEBP', 8) || data.length < 30) return undefined;
  if (data.readUInt32LE(4) !== data.length - 8) return undefined;
  let offset = 12;
  let width: number | undefined;
  let height: number | undefined;
  let sawImageData = false;

  while (offset + 8 <= data.length) {
    const type = data.toString('latin1', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const end = payload + length;
    if (end > data.length) return undefined;

    if (type === 'VP8X') {
      if (length !== 10 || (data[payload] & 0x02) !== 0) return undefined; // Only static raster images are accepted.
      width = uint24LE(data, payload + 4) + 1;
      height = uint24LE(data, payload + 7) + 1;
    } else if (type === 'VP8 ') {
      if (length < 10 || !startsWith(data, '\x9d\x01\x2a', payload + 3)) return undefined;
      width = data.readUInt16LE(payload + 6) & 0x3fff;
      height = data.readUInt16LE(payload + 8) & 0x3fff;
      sawImageData = true;
    } else if (type === 'VP8L') {
      if (length < 5 || data[payload] !== 0x2f) return undefined;
      const bits = data.readUInt32LE(payload + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      sawImageData = true;
    }
    offset = end + (length % 2);
  }
  if (offset !== data.length || !sawImageData || width === undefined || height === undefined) return undefined;
  return { contentType: 'image/webp', width, height };
}

/** Parses enough of the image container to validate its structure and decoded dimensions. */
export function describeImage(data: Buffer): ImageDescription | undefined {
  if (startsWith(data, '\x89PNG\r\n\x1a\n')) return pngDescription(data);
  if (startsWith(data, '\xff\xd8')) return jpegDescription(data);
  if (startsWith(data, 'RIFF')) return webpDescription(data);
  return undefined;
}
