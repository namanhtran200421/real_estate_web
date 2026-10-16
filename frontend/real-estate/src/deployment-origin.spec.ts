import { deploymentOrigin } from './deployment-origin';

describe('deploymentOrigin', () => {
  it('prefers an explicit canonical site origin', () => {
    expect(
      deploymentOrigin({
        PUBLIC_SITE_URL: 'https://booking.example.com',
        VERCEL_PROJECT_PRODUCTION_URL: 'project.vercel.app',
      }),
    ).toBe('https://booking.example.com');
  });

  it('uses Vercel deployment hosts without trusting the request Host header', () => {
    expect(deploymentOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'project.vercel.app' })).toBe(
      'https://project.vercel.app',
    );
    expect(deploymentOrigin({ VERCEL_URL: 'preview-123.vercel.app' })).toBe(
      'https://preview-123.vercel.app',
    );
  });

  it('fails closed instead of falling back to the request Host in production', () => {
    expect(() => deploymentOrigin({ NODE_ENV: 'production' })).toThrow(
      /PUBLIC_SITE_URL or a Vercel deployment URL is required in production/,
    );
    expect(() =>
      deploymentOrigin({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'http://booking.example.com' }),
    ).toThrow(/https origin/);
    expect(
      deploymentOrigin({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://booking.example.com' }),
    ).toBe('https://booking.example.com');
  });

  it('fails closed for blank production origins and malformed deployment URLs', () => {
    expect(() =>
      deploymentOrigin({ NODE_ENV: 'production', PUBLIC_SITE_URL: ' ', VERCEL_URL: ' ' }),
    ).toThrow(/required in production/);
    expect(() =>
      deploymentOrigin({ NODE_ENV: 'production', VERCEL_URL: 'attacker.example/path' }),
    ).toThrow(/https origin/);
    expect(() =>
      deploymentOrigin({ NODE_ENV: 'production', VERCEL_URL: 'user:password@attacker.example' }),
    ).toThrow(/https origin/);
    expect(
      deploymentOrigin({ NODE_ENV: 'production', VERCEL_URL: 'preview-123.vercel.app' }),
    ).toBe('https://preview-123.vercel.app');
  });

  it('refuses origins that could inject a protocol, credentials or extra URL parts', () => {
    for (const value of [
      'javascript:alert(1)',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/?query=yes',
    ]) {
      expect(() => deploymentOrigin({ PUBLIC_SITE_URL: value })).toThrow();
    }
  });
});
