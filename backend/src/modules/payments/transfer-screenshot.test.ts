import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_SCREENSHOT_BYTES, readTransferScreenshot, showsTransfer } from './transfer-screenshot.js';

// Decodable 1 × 1 images. Validation must go beyond each format's first few magic bytes.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuU', 'base64');

describe('readTransferScreenshot', () => {
  it('accepts a JPEG from the guest’s phone', () => {
    const screenshot = readTransferScreenshot(JPEG);
    assert.equal(screenshot.contentType, 'image/jpeg');
    assert.deepEqual(screenshot.data, JPEG);
  });

  it('accepts PNG and WebP, labelled by what the bytes are', () => {
    assert.equal(readTransferScreenshot(PNG).contentType, 'image/png');
    assert.equal(readTransferScreenshot(WEBP).contentType, 'image/webp');
  });

  it('refuses anything that is not one of those images, whatever it claims to be', () => {
    const notScreenshots = [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<!doctype html><script>alert(1)</script>'),
      Buffer.from('%PDF-1.7\n'),
      Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'),
      // RIFF container that is not WebP (a WAV file)
      Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'),
      // Magic bytes without a complete, structurally valid image.
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
      Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'),
      // Do not store a valid image with an executable or other payload appended.
      Buffer.concat([PNG, Buffer.from('<script>alert(1)</script>')]),
      Buffer.concat([JPEG, Buffer.from('<script>alert(1)</script>')]),
      Buffer.concat([WEBP, Buffer.from('<script>alert(1)</script>')]),
    ];
    for (const body of notScreenshots) {
      assert.throws(() => readTransferScreenshot(body), { status: 415, code: 'SCREENSHOT_NOT_IMAGE' });
    }
  });

  it('asks for the screenshot when the report carries none', () => {
    // No body, an empty one, or the old JSON-only report ({ option }) parsed into an object.
    for (const body of [undefined, Buffer.alloc(0), { option: 'deposit' }]) {
      assert.throws(() => readTransferScreenshot(body), { status: 400, code: 'SCREENSHOT_REQUIRED' });
    }
  });

  it('enforces the byte limit even when called without the HTTP body parser', () => {
    assert.throws(() => readTransferScreenshot(Buffer.alloc(MAX_SCREENSHOT_BYTES + 1)), {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('refuses compressed images whose decoded dimensions could exhaust memory', () => {
    const enormous = Buffer.from(PNG);
    enormous.writeUInt32BE(8_192, 16);
    enormous.writeUInt32BE(8_192, 20);
    assert.throws(() => readTransferScreenshot(enormous), {
      status: 422,
      code: 'SCREENSHOT_DIMENSIONS_TOO_LARGE',
    });
  });
});

describe('showsTransfer', () => {
  const booking = { note: 'RE2610HVGCU', amount: 1_033_000 };

  it('recognises a bank app’s success screen for this booking', () => {
    // Text as OCR reads a Vietcombank success screen.
    const text = 'Chuyển tiền thành công\n1.033.000 VND\nNgười nhận DO HOANG HAI\nNội dung RE2610HVGCU\n12/10/2026 15:42';
    assert.equal(showsTransfer(text, booking), true);
  });

  it('still recognises it through the usual OCR misreadings', () => {
    const misread = [
      'Noi dung: RE 2610 HVGCU', // note split up
      'ND: RE261OHVGCU', // 0 read as O
      'So tien 1,033,000d', // only the amount, with other separators
      'Chuyen tien thanh cong', // accents lost, no note or amount legible
    ];
    for (const text of misread) assert.equal(showsTransfer(text, booking), true, text);
  });

  it('does not take an unrelated image for a transfer', () => {
    const unrelated = [
      '', // a photo with no text
      'Đà Lạt mùa hoa dã quỳ', // a caption
      'Giá chỉ 500.000 VND / đêm', // one banking word and another amount
    ];
    for (const text of unrelated) assert.equal(showsTransfer(text, booking), false, text);
  });
});
