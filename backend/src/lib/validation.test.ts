import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageSrc } from './validation.js';

describe('imageSrc', () => {
  it('accepts site files and https images', () => {
    for (const src of ['/apartments/sun-garden-a04-12/01.jpg', 'https://images.unsplash.com/photo-1?w=800']) {
      assert.equal(imageSrc.safeParse(src).success, true, src);
    }
  });

  it('refuses scripts, data, plain http and protocol-relative addresses', () => {
    for (const src of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'http://example.com/a.jpg',
      '//evil.example/a.jpg',
      '/\\evil.example/a.jpg',
      'apartments/01.jpg',
      'https://exa mple.com/a.jpg',
    ]) {
      assert.equal(imageSrc.safeParse(src).success, false, src);
    }
  });
});
