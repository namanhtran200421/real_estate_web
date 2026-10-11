import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';

const EMAIL = 'owner.hai@example.com';

describe('passwordProblem', () => {
  it('accepts a long, uncommon password', () => {
    assert.equal(passwordProblem('dalat-mua-mua-2026-xanh', EMAIL), null);
  });

  for (const [name, password] of [
    ['a short password', 'Abc!2345678'],
    ['digits only', '123456789012'],
    ['a common password', 'password1234'],
    ['a common password with extras', 'Matkhau@2026!'],
    ['too few different characters', 'aaaaaaaaaaab'],
    ['the email name', 'owner.hai-2026-secure'],
    ['an over-long password', 'x'.repeat(201)],
  ]) {
    it(`rejects ${name}`, () => {
      assert.notEqual(passwordProblem(password, EMAIL), null);
    });
  }
});

describe('hashPassword', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('dalat-mua-mua-2026-xanh');
    assert.equal(await verifyPassword('dalat-mua-mua-2026-xanh', hash), true);
    assert.equal(await verifyPassword('dalat-mua-mua-2026-xanX', hash), false);
  });
});
