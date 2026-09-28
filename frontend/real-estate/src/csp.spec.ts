import { contentSecurityPolicy, stampScriptNonces } from './csp';

describe('stampScriptNonces', () => {
  const stamp = (html: string) => stampScriptNonces(html, 'N0NCE');

  it('stamps inline and external scripts', () => {
    expect(stamp('<script>go()</script>')).toBe('<script nonce="N0NCE">go()</script>');
    expect(stamp('<script src="main.js" type="module"></script>')).toBe(
      '<script nonce="N0NCE" src="main.js" type="module"></script>',
    );
    expect(stamp('<SCRIPT type="text/javascript" id="x">')).toBe('<script nonce="N0NCE" type="text/javascript" id="x">');
  });

  it('leaves JSON data blocks alone', () => {
    const state = '<script id="ng-state" type="application/json">{}</script>';
    const ld = '<script id="structured-data" type="application/ld+json">{}</script>';
    expect(stamp(state)).toBe(state);
    expect(stamp(ld)).toBe(ld);
  });

  it('never stamps a script twice or touches look-alike tags', () => {
    expect(stamp('<script nonce="other">x</script>')).toBe('<script nonce="other">x</script>');
    expect(stamp('<scripts>')).toBe('<scripts>');
    expect(stamp('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});

describe('contentSecurityPolicy', () => {
  it('allows only this site, the nonce and Turnstile to run scripts, and forbids framing', () => {
    const csp = contentSecurityPolicy('N0NCE', 'https://api.example.com', true);
    expect(csp).toContain("script-src 'self' 'nonce-N0NCE' https://challenges.cloudflare.com");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("connect-src 'self' https://api.example.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('does not upgrade requests on plain http (local runs)', () => {
    expect(contentSecurityPolicy('N', 'http://localhost:3000', false)).not.toContain('upgrade-insecure-requests');
  });
});
