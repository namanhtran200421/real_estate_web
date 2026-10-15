import { loadBookingAccessTokens } from './booking.service';

describe('guest booking token storage', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  const future = Math.floor(now / 1_000 + 60).toString(36);
  const past = Math.floor(now / 1_000 - 60).toString(36);
  const token = (expiry: string) => `v1.${expiry}.${'n'.repeat(22)}.${'s'.repeat(43)}`;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('migrates a live token to tab-scoped storage and deletes the persistent copy', () => {
    localStorage.setItem(
      'booking-access-tokens',
      JSON.stringify({ 'RE-2610-ABCDE': token(future) }),
    );

    expect(loadBookingAccessTokens(now)).toEqual({ 'RE-2610-ABCDE': token(future) });
    expect(localStorage.getItem('booking-access-tokens')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('booking-access-tokens')!)).toEqual({
      'RE-2610-ABCDE': token(future),
    });
  });

  it('purges expired, legacy and malformed stored authority', () => {
    localStorage.setItem('booking-access-tokens', JSON.stringify({ legacy: 'old-static-token' }));
    sessionStorage.setItem(
      'booking-access-tokens',
      JSON.stringify({ expired: token(past), malformed: { token: token(future) } }),
    );

    expect(loadBookingAccessTokens(now)).toEqual({});
    expect(localStorage.getItem('booking-access-tokens')).toBeNull();
    expect(sessionStorage.getItem('booking-access-tokens')).toBeNull();
  });
});
