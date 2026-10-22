/** Focused, synthetic security checks. No real accounts, database access or notification sends. */
import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { scryptSync } from 'node:crypto';
import type { Db } from '../src/db/pool.js';
import type { BookingRecord, GuestIdentity } from '../src/modules/bookings/booking.types.js';

// Override machine credentials before application modules (and dotenv) are evaluated.
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',
  DB_TRANSPORT: 'tcp', DB_SSL: 'false', SITE_URL: 'https://example.invalid', JOBS_ENABLED: 'false',
  BOOKING_TOKEN_SECRET: 'synthetic-booking-token-secret-for-security-tests',
  GUEST_IDENTITY_ENCRYPTION_KEY: 'synthetic-identity-secret-for-security-tests',
  EMAIL_FROM: 'test@example.invalid', OWNER_EMAIL: 'owner@example.invalid', RESEND_API_KEY: '',
  BANK_BIN: '970436', BANK_NAME: 'Synthetic', BANK_ACCOUNT_NUMBER: '0000000000', BANK_ACCOUNT_NAME: 'SYNTHETIC',
});
const { accessTokenFor, assertAccess } = await import('../src/modules/bookings/booking-access.js');
const { encryptGuestIdentity, decryptGuestIdentity, identityKey } = await import('../src/modules/bookings/guest-identity.crypto.js');
const { readTransferScreenshot, sendScreenshot, MAX_SCREENSHOT_BYTES } = await import('../src/modules/payments/transfer-screenshot.js');
const passwords = await import('../src/modules/admin-auth/password.js');
const { addDays, todayIn } = await import('../src/lib/dates.js');
const { pool } = await import('../src/db/pool.js');
const { bookingRepository } = await import('../src/modules/bookings/booking.repository.js');
const { bookingService } = await import('../src/modules/bookings/booking.service.js');
const { paymentService } = await import('../src/modules/payments/payment.service.js');
const { paymentRepository } = await import('../src/modules/payments/payment.repository.js');
const { assetIncidentRepository } = await import('../src/modules/bookings/asset-incident.repository.js');
const { apartmentRepository } = await import('../src/modules/apartments/apartment.repository.js');
const { holidayService } = await import('../src/modules/holidays/holiday.service.js');
const { guestIdentityRepository } = await import('../src/modules/bookings/guest-identity.repository.js');
const { inspectionRepository } = await import('../src/modules/bookings/inspection.repository.js');
const { emailService } = await import('../src/modules/notifications/email.service.js');
const { adminAuthRepository } = await import('../src/modules/admin-auth/admin-auth.repository.js');
const { adminAuthService } = await import('../src/modules/admin-auth/admin-auth.service.js');

// Fail closed if a test forgets to provide an isolated transaction/repository double.
const unexpectedIO = async (): Promise<never> => { throw new Error('Security harness forbids unmocked I/O'); };
pool.connect = unexpectedIO;
pool.query = unexpectedIO;
globalThis.fetch = unexpectedIO;
after(async () => { await pool.end(); });
const errorCode = (code: string) => (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === code;

const identity: GuestIdentity = {
  documentType: 'cccd', nationality: 'VN', fullName: 'SYNTHETIC PERSON', documentNumber: '000000000000',
  dateOfBirth: '1990-01-01', stayReason: 'Synthetic regression fixture',
};
const owner = { id: 'synthetic-owner', email: 'owner@example.invalid', name: 'SYNTHETIC' };
const booking = (overrides: Partial<BookingRecord> = {}): BookingRecord => ({
  id: 'synthetic-booking', reference: 'RE-2611-TEST1', apartmentId: 'synthetic-apartment', apartmentSlug: 'synthetic',
  apartmentName: 'Synthetic', checkIn: '2090-01-01', checkOut: '2090-01-02', guests: 1,
  customerName: 'SYNTHETIC', customerPhone: '0000000000', customerEmail: 'guest@example.invalid', message: null,
  priceBreakdown: { lines: [], subtotal: 1_000_000, stayDiscount: null, promo: null, discountTotal: 0, total: 1_000_000, depositPercent: 20, deposit: 200_000 },
  totalAmount: 1_000_000, depositAmount: 0, assetSecurityAmount: 200_000, amountPaid: 0,
  status: 'pending', paymentStatus: 'unpaid', holdExpiresAt: null, promoCodeId: null, createdIp: null,
  createdAt: new Date('2026-01-01'), confirmedAt: null, cancelledAt: null, cancellationReason: null, completedAt: null,
  actualCheckOutAt: null, scheduledCheckOutAt: new Date('2090-01-02T05:00:00Z'), ...overrides,
});

test('guest access is booking-bound, authenticated, and expires at the exact boundary', () => {
  const now = 1_800_000_000_000;
  const token = accessTokenFor('booking-a', now);
  assert.doesNotThrow(() => assertAccess('booking-a', token, now));
  assert.throws(() => assertAccess('booking-b', token, now), errorCode('NOT_FOUND'));
  const parts = token.split('.');
  const expiry = Number.parseInt(parts[1], 36) * 1000;
  assert.doesNotThrow(() => assertAccess('booking-a', token, expiry - 1));
  assert.throws(() => assertAccess('booking-a', token, expiry), errorCode('NOT_FOUND'));
  for (const malformed of [undefined, '', token + '.extra', token.replace(/^v1/, 'v2'), `v1.${parts[1]}.bad.${parts[3]}`]) {
    assert.throws(() => assertAccess('booking-a', malformed, now), errorCode('NOT_FOUND'));
  }
  for (const index of [1, 2, 3]) {
    const modified = [...parts];
    modified[index] = (modified[index][0] === 'a' ? 'b' : 'a') + modified[index].slice(1);
    assert.throws(() => assertAccess('booking-a', modified.join('.'), now), errorCode('NOT_FOUND'));
  }
  assert.notEqual(accessTokenFor('booking-a', now), token, 'issuance must use random nonces');
});

test('identity AEAD rejects wrong key, row/index AAD, modified ciphertext, tag and truncation', () => {
  const key = identityKey('synthetic-key');
  const ciphertext = encryptGuestIdentity(identity, key, 'booking-a', 0);
  assert.deepEqual(decryptGuestIdentity(ciphertext, key, 'booking-a', 0), identity);
  assert.notEqual(encryptGuestIdentity(identity, key, 'booking-a', 0), ciphertext);
  assert.throws(() => decryptGuestIdentity(ciphertext, identityKey('other-key'), 'booking-a', 0));
  assert.throws(() => decryptGuestIdentity(ciphertext, key, 'booking-b', 0));
  assert.throws(() => decryptGuestIdentity(ciphertext, key, 'booking-a', 1));
  for (const index of [1, 2, 3]) {
    const parts = ciphertext.split('.');
    const bytes = Buffer.from(parts[index], 'base64url'); bytes[0] ^= 1; parts[index] = bytes.toString('base64url');
    assert.throws(() => decryptGuestIdentity(parts.join('.'), key, 'booking-a', 0));
  }
  const parts = ciphertext.split('.'); parts[2] = Buffer.from(parts[2], 'base64url').subarray(0, 8).toString('base64url');
  assert.throws(() => decryptGuestIdentity(parts.join('.'), key, 'booking-a', 0));
  assert.throws(() => decryptGuestIdentity('v1.truncated', key, 'booking-a', 0));
});

const png = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
test('upload gate accepts small PNG bytes but rejects active content, malformed and oversized containers', () => {
  assert.equal(readTransferScreenshot(png()).contentType, 'image/png');
  for (const input of [undefined, {}, Buffer.alloc(0)]) assert.throws(() => readTransferScreenshot(input), errorCode('SCREENSHOT_REQUIRED'));
  for (const input of [Buffer.from('<svg><script>alert(1)</script></svg>'), Buffer.from('89504e470d0a1a0a','hex'), png().subarray(0, -1), Buffer.concat([png(), Buffer.from('tail')]), Buffer.from('RIFFbrokenWEBP')]) {
    assert.throws(() => readTransferScreenshot(input), errorCode('SCREENSHOT_NOT_IMAGE'));
  }
  assert.throws(() => readTransferScreenshot(Buffer.alloc(MAX_SCREENSHOT_BYTES + 1)), errorCode('PAYLOAD_TOO_LARGE'));
  const dimensions = png(); dimensions.writeUInt32BE(9000, 16);
  assert.throws(() => readTransferScreenshot(dimensions), errorCode('SCREENSHOT_DIMENSIONS_TOO_LARGE'));
  const pixels = png(); pixels.writeUInt32BE(6000, 16); pixels.writeUInt32BE(6000, 20);
  assert.throws(() => readTransferScreenshot(pixels), errorCode('SCREENSHOT_DIMENSIONS_TOO_LARGE'));
});

test('private transfer screenshots prevent caching and active content execution', () => {
  const headers = new Map<string, unknown>(); let sent: unknown;
  const response = { setHeader: (name: string, value: unknown) => { headers.set(name, value); }, send: (body: unknown) => { sent = body; } };
  const screenshot = readTransferScreenshot(png());
  sendScreenshot(response as Parameters<typeof sendScreenshot>[0], screenshot);
  assert.equal(headers.get('Cache-Control'), 'private, no-store');
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
  assert.equal(sent, screenshot.data);
});

test('password policy evaluates the same NFKC password that hashing uses', () => {
  for (const value of ['ｐａｓｓｗｏｒｄ１２３４', 'Ｏｗｎｅｒ００００！！', '１２３４５６７８９０１２']) {
    assert.notEqual(passwords.passwordProblem(value, 'owner@example.invalid'), null);
    assert.equal(passwords.passwordProblem(value, 'owner@example.invalid'), passwords.passwordProblem(value.normalize('NFKC'), 'owner@example.invalid'));
  }
  assert.equal(passwords.passwordProblem('Synthetic-River-93!', 'owner@example.invalid'), null);
  const rawOverLimit = 'e\u0301A9!'.repeat(42);
  assert.ok(rawOverLimit.length > 200 && rawOverLimit.normalize('NFKC').length < 200);
  assert.notEqual(passwords.passwordProblem(rawOverLimit, 'owner@example.invalid'), null);
  assert.equal(passwords.passwordProblem(rawOverLimit.normalize('NFKC'), 'owner@example.invalid'), null);
});
const legacyPassword = 'Synthetic-River-93!';
const legacySalt = Buffer.alloc(16, 7);
const legacyHash = ['scrypt', 32768, 8, 1, legacySalt.toString('base64'), scryptSync(legacyPassword, legacySalt, 64, {N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('base64')].join('$');
test('new scrypt policy preserves legacy authentication and detects transparent upgrade requirements', async () => {
  assert.equal(await passwords.verifyPassword(legacyPassword, legacyHash), true);
  assert.equal(await passwords.verifyPassword('incorrect-password', legacyHash), false);
  assert.equal(passwords.needsPasswordRehash(legacyHash), true);
  const current = await passwords.hashPassword(legacyPassword);
  assert.deepEqual(current.split('$').slice(0,4), ['scrypt','32768','8','3']);
  assert.equal(passwords.needsPasswordRehash(current), false);
  assert.equal(await passwords.verifyPassword(legacyPassword, current), true);
  const compatibleUnicode = legacyPassword.replace(/[!-~]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
  assert.equal(await passwords.verifyPassword(compatibleUnicode, current), true);
  assert.equal(await passwords.verifyPassword('invalid', 'not-a-hash'), false);
});

test('legacy hash upgrade uses compare-and-swap and never creates a session after a competing password change', async (t) => {
  transaction(t);
  t.mock.method(adminAuthRepository, 'findByEmail', async () => ({...owner, password_hash: legacyHash}));
  t.mock.method(adminAuthRepository, 'findById', async () => ({...owner, password_hash: legacyHash}));
  let sessions = 0; let upgradedHash = '';
  t.mock.method(adminAuthRepository, 'upgradePasswordHash', async (_id: string, previous: string, next: string) => {
    assert.equal(previous, legacyHash); upgradedHash = next; return false;
  });
  t.mock.method(adminAuthRepository, 'createSession', async () => { sessions++; return new Date(); });
  await assert.rejects(adminAuthService.login(owner.email, legacyPassword, {ip: undefined,userAgent: undefined}), errorCode('UNAUTHORIZED'));
  assert.equal(sessions, 0); assert.equal(passwords.needsPasswordRehash(upgradedHash), false);
});

function transaction(t: TestContext) {
  const statements: string[] = [];
  t.mock.method(pool, 'connect', async () => ({ query: async (sql: string) => {statements.push(sql);return {rows:[]};}, release: () => {} }));
  return statements;
}

test('B-01 reported NULL-deadline holds stay in the actual repository count predicate', async () => {
  let sql = ''; let parameters: unknown[] = [];
  const db = { query: async (text: string, values: unknown[]) => {sql=text;parameters=values;return {rows:[{count:3}]};} } as unknown as Db;
  assert.equal(await bookingRepository.countActiveHolds({email:'guest@example.invalid',phone:'0000000000',ip:undefined},db),3);
  assert.match(sql, /AND\s*\(hold_expires_at\s+IS\s+NULL\s+OR\s+hold_expires_at\s*>\s*now\(\)\)/i);
  assert.match(sql, /hold_expires_at\s*>\s*now\(\)/i);
  assert.deepEqual(parameters,['guest@example.invalid','0000000000',null]);
});

test('B-01 fourth unpaid blocking hold is refused before insertion and after budget lock', async (t) => {
  const statements = transaction(t); const calls: string[] = [];
  t.mock.method(bookingRepository, 'expireStaleHolds', async () => {calls.push('expire');return 0;});
  t.mock.method(bookingRepository, 'lockHoldBudget', async () => {calls.push('lock');});
  t.mock.method(bookingRepository, 'hasGuestOverlap', async () => false);
  t.mock.method(bookingRepository, 'countActiveHolds', async () => {calls.push('count');return 3;});
  t.mock.method(bookingRepository, 'insert', async () => {throw new Error('fourth hold must never insert');});
  await assert.rejects(bookingService.createBooking({apartmentSlug:'synthetic', checkIn:'2090-01-01',checkOut:'2090-01-02',guests:1,customer:{name:'Synthetic',email:'guest@example.invalid',phone:'0000000000'},guestIdentities:[identity]},undefined),errorCode('TOO_MANY_PENDING_BOOKINGS'));
  assert.deepEqual(calls,['lock','expire','count']);
  assert.deepEqual(statements,['BEGIN','ROLLBACK']);
});

// Negative financial actions are isolated: any missed guard trips the default I/O prohibition.
for (const [name, fields, expected] of [
  ['before check-out',{status:'confirmed'},'INVALID_STATUS'],
  ['with unpaid rent',{status:'completed',amountPaid:0},'RENT_DUE'],
  ['without inspection',{status:'completed',amountPaid:1_000_000},'INSPECTION_REQUIRED'],
] as const) {
  test(`B-02 generic deposit refund rejects ${name}`, async (t) => {
    transaction(t); const row = booking(fields);
    t.mock.method(paymentRepository,'findById',async()=>({id:'synthetic-payment',bookingId:row.id,state:'succeeded',purpose:'asset_security',amount:200_000}));
    t.mock.method(bookingRepository,'findById',async()=>row);
    t.mock.method(paymentRepository,'refundedTotal',async()=>0);
    t.mock.method(inspectionRepository,'get',async()=>undefined);
    t.mock.method(paymentRepository,'insertRefund',async()=>{throw new Error('guard allowed invalid refund');});
    await assert.rejects(paymentService.recordRefund('synthetic-payment',{amount:50_000,reason:'Synthetic test'},owner),errorCode(expected));
  });
}

test('B-02 manual confirmation rejects an incomplete security deposit', async (t) => {
  transaction(t);
  t.mock.method(bookingRepository,'findByReference',async()=>booking());
  t.mock.method(assetIncidentRepository,'financials',async()=>({assetSecurityReceived:100_000,assetSecurityRefunded:0,assetSecurityDue:100_000}));
  t.mock.method(bookingRepository,'markConfirmed',async()=>{throw new Error('partial deposit must not confirm');});
  await assert.rejects(bookingService.confirm('RE-2611-TEST1',owner),errorCode('INVALID_STATUS'));
});

test('B-01 actual budget locks use transaction-scoped, canonical identity keys in deterministic order', async () => {
  const queries: {sql:string;values:unknown[]}[] = [];
  const db = {query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:[]};}} as unknown as Db;
  await bookingRepository.lockHoldBudget({email:'Guest@Example.invalid',phone:'0000000000',ip:'2001:db8::1'},db);
  assert.equal(queries.length,3);
  for (const query of queries) assert.match(query.sql,/pg_advisory_xact_lock/);
  assert.match(queries[0].sql,/'booking-hold:email:' \|\| lower\(\$1\)/);
  assert.match(queries[1].sql,/'booking-hold:ip:' \|\| host\(\$1::inet\)/);
  assert.match(queries[2].sql,/'booking-hold:phone:'/);
  assert.deepEqual(queries.map(q=>q.values),[['Guest@Example.invalid'],['2001:db8::1'],['0000000000']]);
});

for (const shared of ['email','phone','ip'] as const) {
  test(`B-01 concurrent disjoint-date creates sharing ${shared} cannot pass the same final slot (in-memory lock model)`,async(t)=>{
    // Exercise real create/count/lock orchestration with simulated transaction-scoped locks.
    // This deliberately does not claim to test PostgreSQL scheduling or its exclusion constraints.
    type Hold = {email:string;phone:string;ip:string|undefined};
    const first:Hold={email:'first@example.invalid',phone:'0000000001',ip:'192.0.2.1'};
    const second:Hold={email:'second@example.invalid',phone:'0000000002',ip:'192.0.2.2'};
    second[shared]=first[shared]!;
    if(shared==='email') second.email=second.email.toUpperCase();
    const held:Hold[]=[{...first},{...second}];
    const tails=new Map<string,Promise<void>>();
    let readCounts=0;
    t.mock.method(pool,'connect',async()=>{
      const releases:(()=>void)[]=[];
      const client={query:async(sql:string,values:unknown[]=[])=>{
        if(sql.includes('pg_advisory_xact_lock')){
          const kind=sql.match(/booking-hold:(email|ip|phone):/)![1];
          const key=kind+':'+(kind==='email'?String(values[0]).toLowerCase():String(values[0]));
          const previous=tails.get(key)??Promise.resolve();
          let unlock!:()=>void;const current=new Promise<void>(resolve=>{unlock=resolve;});
          tails.set(key,current);await previous;releases.push(unlock);return {rows:[]};
        }
        if(sql.includes('SELECT count(*)::int AS count')){
          readCounts++;
          const [email,phone,ip]=values;
          const count=held.filter(h=>h.email.toLowerCase()===String(email).toLowerCase()||h.phone===phone||(ip&&h.ip===ip)).length;
          return {rows:[{count}]};
        }
        if(sql==='COMMIT'||sql==='ROLLBACK')releases.splice(0).forEach(release=>release());
        else assert.equal(sql,'BEGIN','unexpected database operation in security harness');
        return {rows:[]};
      },release:()=>{releases.splice(0).forEach(release=>release());}};
      return client;
    });
    t.mock.method(bookingRepository,'expireStaleHolds',async()=>0);
    t.mock.method(bookingRepository,'hasGuestOverlap',async()=>false);
    t.mock.method(apartmentRepository,'findBySlug',async()=>({id:'synthetic-apartment',slug:'synthetic',isActive:true,guests:4,depositPercent:20,pricing:{weekday:1_000_000,weekend:1_000_000,holiday:1_000_000,weekly:0,monthly:0,longStayDiscounts:[]}}));
    t.mock.method(apartmentRepository,'findUnavailableDates',async()=>new Map());
    t.mock.method(holidayService,'holidayDatesBetween',async()=>new Set());
    t.mock.method(bookingRepository,'insert',async(input:{customer:{email:string;phone:string};ip:string|undefined})=>{held.push({...input.customer,ip:input.ip});return 'synthetic-created';});
    t.mock.method(bookingRepository,'addEvent',async()=>{});
    t.mock.method(bookingRepository,'emailContext',async()=>({reference:'RE-2611-TEST1',assetSecurityAmount:200_000}));
    t.mock.method(emailService,'queueBookingHeld',async()=>{});
    t.mock.method(guestIdentityRepository,'insertAll',async()=>{});
    t.mock.method(bookingRepository,'findById',async()=>booking());
    t.mock.method(paymentRepository,'listForBooking',async()=>[]);
    t.mock.method(assetIncidentRepository,'financials',async()=>({assetSecurityDue:200_000,incidentAmountDue:0}));
    t.mock.method(assetIncidentRepository,'list',async()=>[]);
    const requests=[first,second].map((who,index)=>bookingService.createBooking({apartmentSlug:'synthetic',checkIn:addDays(todayIn('Asia/Ho_Chi_Minh'),30+index*2),checkOut:addDays(todayIn('Asia/Ho_Chi_Minh'),31+index*2),guests:1,customer:{name:'Synthetic',email:who.email,phone:who.phone},guestIdentities:[identity]},who.ip));
    const results=await Promise.allSettled(requests);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1,results.map(r=>r.status==='rejected'?String(r.reason):'created').join('; '));
    const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected&&rejected.status==='rejected');
    assert.ok(errorCode('TOO_MANY_PENDING_BOOKINGS')(rejected.reason));
    assert.equal(held.length,3);assert.equal(readCounts,2);
  });
}

for (const status of ['cancelled','expired','completed'] as const) {
  test(`B-02 preserves legitimate ${status} deposit refunds and records completed inspection lock`,async(t)=>{
    const statements=transaction(t);const row=booking({status,amountPaid:1_000_000,checkIn:'2020-01-01'});
    const events:string[]=[];let inserted=0;
    t.mock.method(paymentRepository,'findById',async()=>({id:'synthetic-payment',bookingId:row.id,state:'succeeded',purpose:'asset_security',amount:200_000}));
    t.mock.method(bookingRepository,'findById',async()=>row);
    t.mock.method(paymentRepository,'refundedTotal',async()=>0);
    t.mock.method(inspectionRepository,'get',async()=>({results:[]}));
    t.mock.method(assetIncidentRepository,'list',async()=>[]);
    t.mock.method(assetIncidentRepository,'financials',async()=>({assetSecurityHeld:200_000,incidentAmountDue:0}));
    t.mock.method(paymentRepository,'insertRefund',async()=>{inserted++;});
    t.mock.method(bookingRepository,'addEvent',async(_id:string,event:string)=>{events.push(event);});
    t.mock.method(paymentRepository,'totals',async()=>({received:1_000_000,refunded:0,depositReceived:200_000,depositRefunded:50_000}));
    t.mock.method(bookingRepository,'setPaymentProgress',async()=>{});
    t.mock.method(bookingRepository,'emailContext',async()=>({}));
    t.mock.method(emailService,'queueRefundIssued',async()=>{});
    await paymentService.recordRefund('synthetic-payment',{amount:50_000,reason:'Synthetic valid refund'},owner);
    assert.equal(inserted,1);assert.ok(events.includes('refund_recorded'));assert.deepEqual(statements,['BEGIN','COMMIT']);
    if(status==='completed'){
      assert.ok(events.includes('deposit_refunded'));
      t.mock.method(bookingRepository,'findByReference',async()=>row);
      t.mock.method(bookingRepository,'hasEvent',async(_id:string,event:string)=>events.includes(event));
      t.mock.method(inspectionRepository,'upsert',async()=>{throw new Error('inspection changed after refund');});
      await assert.rejects(bookingService.saveInspection(row.reference,[],owner),errorCode('INSPECTION_LOCKED'));
    }
  });
}

for(const [name,open,due,expected] of [['open incident',true,0,'INCIDENT_OPEN'],['unpaid incident',false,10_000,'INCIDENT_DUE']] as const){
  test(`B-02 generic deposit refund rejects ${name}`,async(t)=>{
    transaction(t);const row=booking({status:'completed',amountPaid:1_000_000});
    t.mock.method(paymentRepository,'findById',async()=>({id:'synthetic-payment',bookingId:row.id,state:'succeeded',purpose:'asset_security',amount:200_000}));
    t.mock.method(bookingRepository,'findById',async()=>row);
    t.mock.method(paymentRepository,'refundedTotal',async()=>0);
    t.mock.method(inspectionRepository,'get',async()=>({results:[]}));
    t.mock.method(assetIncidentRepository,'list',async()=>open?[{status:'open'}]:[]);
    t.mock.method(assetIncidentRepository,'financials',async()=>({assetSecurityHeld:200_000,incidentAmountDue:due}));
    t.mock.method(paymentRepository,'insertRefund',async()=>{throw new Error('guard allowed incident refund');});
    await assert.rejects(paymentService.recordRefund('synthetic-payment',{amount:50_000,reason:'Synthetic test'},owner),errorCode(expected));
  });
}

test('successful legacy hash upgrade creates a session only after compare-and-swap succeeds',async(t)=>{
  transaction(t);
  t.mock.method(adminAuthRepository,'findByEmail',async()=>({...owner,password_hash:legacyHash}));
  t.mock.method(adminAuthRepository,'findById',async()=>({...owner,password_hash:legacyHash}));
  const calls:string[]=[];
  t.mock.method(adminAuthRepository,'upgradePasswordHash',async(id:string,previous:string,next:string)=>{
    assert.equal(id,owner.id);assert.equal(previous,legacyHash);assert.equal(passwords.needsPasswordRehash(next),false);calls.push('upgrade');return true;
  });
  t.mock.method(adminAuthRepository,'createSession',async()=>{calls.push('session');return new Date('2090-01-01');});
  t.mock.method(adminAuthRepository,'recordLogin',async()=>{});
  const result=await adminAuthService.login(owner.email,legacyPassword,{ip:undefined,userAgent:undefined});
  assert.equal(result.admin.id,owner.id);assert.ok(result.token.length>=32);assert.deepEqual(calls,['upgrade','session']);
});

for(const legacy of [false,true]){
  test(`B-02 explicit confirmation accepts ${legacy?'legacy rent received':'fully paid security deposit'}`,async(t)=>{
    const statements=transaction(t);const row=booking(legacy?{assetSecurityAmount:0,amountPaid:100_000}:{});let confirmed=0;
    t.mock.method(bookingRepository,'findByReference',async()=>row);
    t.mock.method(assetIncidentRepository,'financials',async()=>({assetSecurityReceived:200_000,assetSecurityRefunded:0,assetSecurityDue:0,assetSecurityHeld:200_000,incidentAmountDue:0}));
    t.mock.method(bookingRepository,'markConfirmed',async()=>{confirmed++;row.status='confirmed';});
    t.mock.method(bookingRepository,'addEvent',async()=>{});
    t.mock.method(bookingRepository,'emailContext',async()=>({}));
    t.mock.method(emailService,'queueBookingConfirmed',async()=>{});
    t.mock.method(paymentRepository,'listForBooking',async()=>[]);
    t.mock.method(paymentRepository,'listRefundsForBooking',async()=>[]);
    t.mock.method(bookingRepository,'listEvents',async()=>[]);
    t.mock.method(guestIdentityRepository,'forAdmin',async()=>({identities:[],expired:0}));
    t.mock.method(assetIncidentRepository,'list',async()=>[]);
    t.mock.method(bookingRepository,'nextArrival',async()=>null);
    t.mock.method(inspectionRepository,'get',async()=>undefined);
    t.mock.method(apartmentRepository,'findBySlug',async()=>undefined);
    const result=await bookingService.confirm(row.reference,owner);
    assert.equal(confirmed,1);assert.equal(result.status,'confirmed');assert.deepEqual(statements,['BEGIN','COMMIT']);
  });
}

test('B-02 legacy accommodation refund retains its existing path without deposit-only guards',async(t)=>{
  transaction(t);const row=booking({assetSecurityAmount:0,status:'confirmed',amountPaid:1_000_000});let inserted=0;
  t.mock.method(paymentRepository,'findById',async()=>({id:'synthetic-payment',bookingId:row.id,state:'succeeded',purpose:'accommodation',amount:1_000_000}));
  t.mock.method(bookingRepository,'findById',async()=>row);
  t.mock.method(paymentRepository,'refundedTotal',async()=>0);
  t.mock.method(inspectionRepository,'get',async()=>{throw new Error('legacy rent refund must not require inspection');});
  t.mock.method(paymentRepository,'insertRefund',async()=>{inserted++;});
  t.mock.method(bookingRepository,'addEvent',async()=>{});
  t.mock.method(paymentRepository,'totals',async()=>({received:1_000_000,refunded:50_000,depositReceived:0,depositRefunded:0}));
  t.mock.method(bookingRepository,'setPaymentProgress',async()=>{});
  t.mock.method(bookingRepository,'emailContext',async()=>({}));
  t.mock.method(emailService,'queueRefundIssued',async()=>{});
  await paymentService.recordRefund('synthetic-payment',{amount:50_000,reason:'Synthetic rent refund'},owner);
  assert.equal(inserted,1);
});
