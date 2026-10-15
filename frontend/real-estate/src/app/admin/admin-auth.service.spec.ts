import { isAdminSession, loadStoredAdminSession } from './admin-auth.service';

describe('isAdminSession', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  const valid = {
    token: 'owner-bearer-token',
    expiresAt: '2026-10-16T01:00:00Z',
    admin: { id: 'owner-1', email: 'owner@example.com', name: 'Owner' },
  };

  it('accepts a complete, unexpired session', () => {
    expect(isAdminSession(valid, now)).toBe(true);
  });

  it('rejects expired and malformed values read from browser storage', () => {
    expect(isAdminSession({ ...valid, expiresAt: '2026-10-15T23:59:59Z' }, now)).toBe(false);
    expect(isAdminSession({ ...valid, token: {} }, now)).toBe(false);
    expect(isAdminSession({ ...valid, admin: { email: 'owner@example.com' } }, now)).toBe(false);
    expect(isAdminSession('not a session', now)).toBe(false);
  });
});

describe('loadStoredAdminSession', () => {
  const valid = {
    token: 'owner-bearer-token',
    expiresAt: '2999-10-16T01:00:00Z',
    admin: { id: 'owner-1', email: 'owner@example.com', name: 'Owner' },
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('migrates the old persistent token into tab-scoped storage and removes the old copy', () => {
    localStorage.setItem('admin-session', JSON.stringify(valid));

    expect(loadStoredAdminSession()).toEqual(valid);
    expect(localStorage.getItem('admin-session')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('admin-session')!)).toEqual(valid);
  });

  it('deletes malformed storage instead of treating it as authenticated state', () => {
    localStorage.setItem('admin-session', JSON.stringify({ token: {}, expiresAt: 'later' }));
    sessionStorage.setItem('admin-session', JSON.stringify({ ...valid, admin: null }));

    expect(loadStoredAdminSession()).toBeUndefined();
    expect(localStorage.getItem('admin-session')).toBeNull();
    expect(sessionStorage.getItem('admin-session')).toBeNull();
  });
});
