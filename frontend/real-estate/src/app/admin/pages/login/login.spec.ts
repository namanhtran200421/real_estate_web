import { adminReturnUrl } from './login';

describe('adminReturnUrl', () => {
  it('keeps valid in-app owner destinations', () => {
    expect(adminReturnUrl('/admin')).toBe('/admin');
    expect(adminReturnUrl('/admin/bookings/RE-2610-ABCDE?tab=payments#latest')).toBe(
      '/admin/bookings/RE-2610-ABCDE?tab=payments#latest',
    );
  });

  it('rejects external, ambiguous and login-loop destinations', () => {
    for (const value of [
      'https://example.com',
      '//example.com/admin',
      '/administrator',
      '/admin\\example.com',
      '/admin%2fbookings',
      '/admin/login',
      '/admin/login?next=/admin',
      '/admin\n/bookings',
    ]) {
      expect(adminReturnUrl(value)).toBe('/admin');
    }
  });
});
