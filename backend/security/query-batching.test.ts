/** Constant-round-trip regression checks using synthetic rows and in-memory transaction doubles. */
import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import type { Db } from '../src/db/pool.js';
import type { BookingEmailContext } from '../src/modules/notifications/email.templates.js';
import type { BookingRecord } from '../src/modules/bookings/booking.types.js';

Object.assign(process.env, {
  NODE_ENV:'test',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',DB_TRANSPORT:'tcp',DB_SSL:'false',
  SITE_URL:'https://example.invalid',JOBS_ENABLED:'false',BOOKING_TOKEN_SECRET:'synthetic-booking-token-secret-for-query-tests',
  GUEST_IDENTITY_ENCRYPTION_KEY:'synthetic-identity-secret-for-query-tests',EMAIL_FROM:'test@example.invalid',OWNER_EMAIL:'owner@example.invalid,backup@example.invalid',
  RESEND_API_KEY:'',BANK_BIN:'970436',BANK_NAME:'Synthetic',BANK_ACCOUNT_NUMBER:'0000000000',BANK_ACCOUNT_NAME:'SYNTHETIC',
});
const {pool}=await import('../src/db/pool.js');
const {bookingRepository}=await import('../src/modules/bookings/booking.repository.js');
const {bookingService}=await import('../src/modules/bookings/booking.service.js');
const {paymentRepository}=await import('../src/modules/payments/payment.repository.js');
const {paymentService}=await import('../src/modules/payments/payment.service.js');
const {emailRepository}=await import('../src/modules/notifications/email.repository.js');
const {emailService}=await import('../src/modules/notifications/email.service.js');
const {assetIncidentRepository}=await import('../src/modules/bookings/asset-incident.repository.js');
const {inspectionRepository}=await import('../src/modules/bookings/inspection.repository.js');

const unexpectedIO=async():Promise<never>=>{throw new Error('Query batching harness forbids unmocked I/O');};
pool.connect=unexpectedIO;pool.query=unexpectedIO;globalThis.fetch=unexpectedIO;
after(async()=>{await pool.end();});
const id=(index:number)=>`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`;
type BatchContext=BookingEmailContext&{id:string;nextArrivalReference:string|null};
const context=(index:number):BatchContext=>({
  id:id(index),reference:`RE-2611-SYN${index}`,customerName:`Synthetic ${index}`,customerEmail:`guest${index}@example.invalid`,
  customerPhone:'0000000000',apartmentName:'Synthetic',apartmentAddress:'Synthetic address',checkIn:'2090-01-01',checkOut:'2090-01-02',
  checkInTime:'14:00',checkOutTime:'12:00',guests:1,nights:1,total:1_000_000,deposit:0,assetSecurityAmount:index%2?0:200_000,
  depositReceivedNet:0,amountPaid:0,holdExpiresAt:null,status:'pending',message:null,nextArrivalReference:index%2?`RE-2611-NEXT${index}`:null,
});
function transaction(t:TestContext){
  const statements:string[]=[];
  const client={query:async(sql:string)=>{statements.push(sql);return {rows:[]};},release:()=>{}};
  t.mock.method(pool,'connect',async()=>client);
  return {statements,client};
}
const hasCode=(code:string)=>(error:unknown)=>!!error&&typeof error==='object'&&'code'in error&&error.code===code;

for(const size of [0,1,24]){
  test(`bulk email contexts use ${size===0?'zero':'one'} query for ${size} bookings and preserve synthetic context fields`,async()=>{
    const ids=Array.from({length:size},(_,index)=>id(index));
    const rows=ids.map((_,index)=>context(index)).reverse();
    const queries:{sql:string;values:unknown[]}[]=[];
    const db={query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows};}} as unknown as Db;
    const result=await bookingRepository.emailContexts(ids,db);
    assert.deepEqual(result,rows);assert.equal(queries.length,size===0?0:1);
    if(size){
      assert.deepEqual(queries[0].values,[ids]);
      assert.match(queries[0].sql,/ANY\s*\(\$1::uuid\[\]\)/i);
      assert.match(queries[0].sql,/nextArrivalReference/);
      assert.match(queries[0].sql,/depositReceivedNet/);
      assert.equal(result[0].customerEmail,rows[0].customerEmail);
    }
  });
}

for(const operation of ['holds','rent'] as const){
  for(const size of [0,1,24]){
    test(`${operation} notifications batch ${size} contexts and preserve per-booking outbox outcomes`,async(t)=>{
      const {client,statements}=transaction(t);const rows=Array.from({length:size},(_,index)=>context(index));
      const ids=rows.map(row=>row.id);let bulkCalls=0;const deliveries:{reference:string;note?:string}[]=[];
      t.mock.method(bookingRepository,'claimHoldsEndingSoon',async(_minutes:number,db:Db)=>{assert.equal(db,client);return ids;});
      t.mock.method(bookingRepository,'claimRentRequests',async(_timezone:string,db:Db)=>{assert.equal(db,client);return ids;});
      t.mock.method(bookingRepository,'emailContexts',async(given:string[],db:Db)=>{bulkCalls++;assert.deepEqual(given,ids);assert.equal(db,client);return [...rows].reverse();});
      t.mock.method(bookingRepository,'emailContext',unexpectedIO);
      t.mock.method(emailService,'queueHoldEndingReminders',async(items:{booking:BookingEmailContext;note:string}[],db:Db)=>{assert.equal(db,client);for(const item of items)deliveries.push({reference:item.booking.reference,note:item.note});});
      t.mock.method(emailService,'queueRentRequests',async(items:BookingEmailContext[],db:Db)=>{assert.equal(db,client);for(const row of items)deliveries.push({reference:row.reference});});
      const count=operation==='holds'?await bookingService.remindOwnerOfEndingHolds():await bookingService.sendRentRequests();
      assert.equal(count,size);assert.equal(deliveries.length,size);if(size)assert.equal(bulkCalls,1);else assert.ok(bulkCalls<=1);
      assert.deepEqual(deliveries.map(item=>item.reference).sort(),rows.map(row=>row.reference).sort());
      if(operation==='holds')for(const row of rows){
        const note=deliveries.find(delivery=>delivery.reference===row.reference)!.note!;
        assert.ok(note.includes(row.reference.replace(/-/g,'')));
        assert.equal(note.endsWith('TS'),row.assetSecurityAmount>0);
      }
      assert.deepEqual(statements,['BEGIN','COMMIT']);
    });
  }
}

test('checkout job shares one combined context read across reminders and late alerts without per-ID lookups',async(t)=>{
  const {client,statements}=transaction(t);const rows=[context(0),context(1),context(2)];let bulkCalls=0;
  const reminderRefs:string[]=[];const late:{reference:string;next:string|null}[]=[];
  t.mock.method(bookingRepository,'claimCheckoutReminders',async(db:Db)=>{assert.equal(db,client);return [id(0),id(1)];});
  t.mock.method(bookingRepository,'claimLateCheckoutAlerts',async(db:Db)=>{assert.equal(db,client);return [id(1),id(2)];});
  t.mock.method(bookingRepository,'emailContexts',async(ids:string[],db:Db)=>{bulkCalls++;assert.equal(db,client);assert.deepEqual([...new Set(ids)].sort(),rows.map(row=>row.id).sort());return [...rows].reverse();});
  t.mock.method(bookingRepository,'emailContext',unexpectedIO);t.mock.method(bookingRepository,'findById',unexpectedIO);t.mock.method(bookingRepository,'nextArrival',unexpectedIO);
  t.mock.method(emailService,'queueCheckoutReminders',async(items:BookingEmailContext[],db:Db)=>{assert.equal(db,client);for(const row of items)reminderRefs.push(row.reference);});
  t.mock.method(emailService,'queueLateCheckoutAlerts',async(items:{booking:BookingEmailContext;nextArrivalReference:string|null}[],db:Db)=>{assert.equal(db,client);for(const row of items)late.push({reference:row.booking.reference,next:row.nextArrivalReference});});
  assert.equal(await bookingService.sendCheckoutNotifications(),4);assert.equal(bulkCalls,1);
  assert.deepEqual(reminderRefs.sort(),[context(0).reference,context(1).reference].sort());
  assert.deepEqual(late.sort((a,b)=>a.reference.localeCompare(b.reference)),[context(1),context(2)].map(row=>({reference:row.reference,next:row.nextArrivalReference})));
  assert.deepEqual(statements,['BEGIN','COMMIT']);
});

test('notification failure rolls back claims and queued work rather than committing a partial batch',async(t)=>{
  const {statements}=transaction(t);const failure=new Error('Synthetic bulk outbox insert failure');
  t.mock.method(bookingRepository,'claimHoldsEndingSoon',async()=>[id(0),id(1)]);
  t.mock.method(bookingRepository,'emailContexts',async()=>[context(0),context(1)]);
  t.mock.method(bookingRepository,'emailContext',unexpectedIO);
  t.mock.method(emailService,'queueHoldEndingReminders',async()=>{throw failure;});
  await assert.rejects(bookingService.remindOwnerOfEndingHolds(),error=>error===failure);
  assert.deepEqual(statements,['BEGIN','ROLLBACK']);
});

for(const size of [0,1,24]){
  test(`refundable deposits use ${size?2:1} queries for ${size} payments, lock before reading refunds, and preserve amounts`,async()=>{
    const payments=Array.from({length:size},(_,index)=>({id:id(index),amount:100_000+index*1000}));
    const refunds=payments.filter((_,index)=>index%2===0).map(payment=>({paymentId:payment.id,amount:20_000}));
    const calls:{sql:string;values:unknown[]}[]=[];
    const db={query:async(sql:string,values:unknown[])=>{calls.push({sql,values});return {rows:calls.length===1?payments:refunds};}} as unknown as Db;
    const result=await paymentRepository.lockRefundableDeposits(id(100),db);
    assert.equal(calls.length,size?2:1);
    assert.match(calls[0].sql,/FOR UPDATE/i);assert.match(calls[0].sql,/ORDER BY[\s\S]*FOR UPDATE/i);
    assert.match(calls[0].sql,/asset_security/);assert.match(calls[0].sql,/succeeded/);assert.deepEqual(calls[0].values,[id(100)]);
    if(size){assert.match(calls[1].sql,/GROUP BY/i);assert.deepEqual(calls[1].values,[payments.map(payment=>payment.id)]);}
    assert.deepEqual(result,payments.map((payment,index)=>({id:payment.id,refundable:payment.amount-(index%2===0?20_000:0)})));
  });
}

for(const size of [0,1,24]){
  test(`refund batch insert uses ${size?1:0} statement for ${size} refunds with parameter-aligned values`,async()=>{
    const refunds=Array.from({length:size},(_,index)=>({paymentId:id(index),amount:(index+1)*1000,reason:`Synthetic reason '${index}`,createdBy:id(100+index)}));
    const queries:{sql:string;values:unknown[]}[]=[];
    const db={query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:[]};}} as unknown as Db;
    await paymentRepository.insertRefunds(refunds,db);assert.equal(queries.length,size?1:0);
    if(size){
      assert.match(queries[0].sql,/INSERT INTO refunds[\s\S]*unnest/i);
      assert.deepEqual(queries[0].values,[refunds.map(row=>row.paymentId),refunds.map(row=>row.amount),refunds.map(row=>row.reason),refunds.map(row=>row.createdBy)]);
      assert.ok(!queries[0].sql.includes("Synthetic reason '"));
    }
  });
}

for(const size of [0,1,24]){
  test(`email outbox batch insert uses ${size?1:0} statement for ${size} messages and preserves recipient/content alignment`,async()=>{
    const emails=Array.from({length:size},(_,index)=>({to:`guest${index}@example.invalid`,subject:`Synthetic ${index}`,html:`<p>Synthetic '${index}</p>`,text:`Synthetic '${index}`}));
    const queries:{sql:string;values:unknown[]}[]=[];
    const db={query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:[]};}} as unknown as Db;
    await emailRepository.enqueueAll(emails,db);assert.equal(queries.length,size?1:0);
    if(size){
      assert.match(queries[0].sql,/INSERT INTO email_outbox[\s\S]*unnest/i);
      assert.deepEqual(queries[0].values,[emails.map(row=>row.to),emails.map(row=>row.subject),emails.map(row=>row.html),emails.map(row=>row.text)]);
    }
  });
}

for(const kind of ['holds','checkout','rent','late'] as const){
  for(const size of [0,1,24]){
    test(`real ${kind} notification renderer batches ${size} contexts into one outbox write with correct recipients`,async()=>{
      const rows=Array.from({length:size},(_,index)=>context(index));const queries:{sql:string;values:unknown[]}[]=[];
      const db={query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:[]};}} as unknown as Db;
      if(kind==='holds')await emailService.queueHoldEndingReminders(rows.map(booking=>({booking,note:booking.reference.replace(/-/g,'')})),db);
      else if(kind==='checkout')await emailService.queueCheckoutReminders(rows,db);
      else if(kind==='rent')await emailService.queueRentRequests(rows,db);
      else await emailService.queueLateCheckoutAlerts(rows.map(booking=>({booking,nextArrivalReference:booking.nextArrivalReference})),db);
      assert.equal(queries.length,size?1:0);
      if(size){
        const ownerNotification=kind==='holds'||kind==='late';
        const recipients=queries[0].values[0] as string[];
        assert.equal(recipients.length,size*(ownerNotification?2:1));
        assert.deepEqual([...recipients].sort(),(ownerNotification?rows.flatMap(()=>['owner@example.invalid','backup@example.invalid']):rows.map(row=>row.customerEmail)).sort());
        const html=queries[0].values[2] as string[];const text=queries[0].values[3] as string[];
        assert.equal(html.length,recipients.length);assert.equal(text.length,recipients.length);
        for(const row of rows)assert.ok(text.some(body=>body.includes(row.reference)),`${row.reference} missing from batch`);
      }
    });
  }
}

const completedBooking=():BookingRecord=>({id:id(100),reference:'RE-2611-REFUND',status:'completed',totalAmount:1_000_000,amountPaid:1_000_000,assetSecurityAmount:200_000} as BookingRecord);
const owner={id:id(200),name:'Synthetic',email:'owner@example.invalid'};
function refundScenario(t:TestContext,held:number){
  const {client,statements}=transaction(t);const booking=completedBooking();let batches=0;let planned:{paymentId:string;amount:number;reason:string;createdBy:string}[]=[];
  const events:{type:string;amount:number}[]=[];const notices:number[]=[];
  t.mock.method(bookingRepository,'findByReference',async(_reference:string,db:Db,lock:boolean)=>{assert.equal(db,client);assert.equal(lock,true);return booking;});
  t.mock.method(inspectionRepository,'get',async()=>({results:[]}));
  t.mock.method(assetIncidentRepository,'list',async()=>[]);
  t.mock.method(assetIncidentRepository,'financials',async()=>({incidentAmountDue:0,assetSecurityHeld:held}));
  t.mock.method(paymentRepository,'lockRefundableDeposits',async(_id:string,db:Db)=>{assert.equal(db,client);return [{id:id(0),refundable:80_000},{id:id(1),refundable:120_000}];});
  t.mock.method(paymentRepository,'listForBooking',unexpectedIO);t.mock.method(paymentRepository,'findById',unexpectedIO);t.mock.method(paymentRepository,'refundedTotal',unexpectedIO);t.mock.method(paymentRepository,'insertRefund',unexpectedIO);
  t.mock.method(paymentRepository,'insertRefunds',async(items:typeof planned,db:Db)=>{assert.equal(db,client);batches++;planned=items;});
  t.mock.method(bookingRepository,'addEvent',async(_id:string,type:string,_actor:string,data:{amount:number})=>{events.push({type,amount:data.amount});});
  t.mock.method(paymentRepository,'totals',async()=>({received:1_000_000,refunded:0,depositReceived:200_000,depositRefunded:held}));
  t.mock.method(bookingRepository,'setPaymentProgress',async()=>{});
  t.mock.method(bookingRepository,'emailContext',async()=>context(0));
  t.mock.method(emailService,'queueRefundIssued',async(_context:BookingEmailContext,total:number)=>{notices.push(total);});
  return {client,statements,booking,events,notices,get batches(){return batches;},get planned(){return planned;}};
}

test('dedicated deposit refund batches writes while preserving per-payment caps, held total, one audit and one guest notice',async(t)=>{
  const state=refundScenario(t,150_000);
  await paymentService.refundDeposit(state.booking.reference,owner);
  assert.equal(state.batches,1);
  assert.deepEqual(state.planned.map(({paymentId,amount})=>({paymentId,amount})),[{paymentId:id(1),amount:120_000},{paymentId:id(0),amount:30_000}]);
  assert.ok(state.planned.every(item=>item.createdBy===owner.id&&item.reason.length>0));
  assert.deepEqual(state.events,[{type:'deposit_refunded',amount:150_000}]);assert.deepEqual(state.notices,[150_000]);
  assert.deepEqual(state.statements,['BEGIN','COMMIT']);
});

test('dedicated deposit refund retains early eligibility gates before any batch payment locks or writes',async(t)=>{
  const state=refundScenario(t,150_000);state.booking.status='confirmed';
  t.mock.method(paymentRepository,'lockRefundableDeposits',unexpectedIO);
  await assert.rejects(paymentService.refundDeposit(state.booking.reference,owner),hasCode('INVALID_STATUS'));
  assert.equal(state.batches,0);assert.deepEqual(state.events,[]);assert.deepEqual(state.notices,[]);assert.deepEqual(state.statements,['BEGIN','ROLLBACK']);
});

test('zero held deposit rejects without batch writes or refund notifications',async(t)=>{
  const state=refundScenario(t,0);
  await assert.rejects(paymentService.refundDeposit(state.booking.reference,owner),hasCode('NOTHING_TO_REFUND'));
  assert.equal(state.batches,0);assert.deepEqual(state.events,[]);assert.deepEqual(state.notices,[]);assert.deepEqual(state.statements,['BEGIN','ROLLBACK']);
});

test('bulk refund insert failure rolls back before audit, recalculation and guest notice',async(t)=>{
  const state=refundScenario(t,150_000);const failure=new Error('Synthetic bulk refund insert failure');
  t.mock.method(paymentRepository,'insertRefunds',async()=>{throw failure;});
  t.mock.method(paymentRepository,'totals',unexpectedIO);
  await assert.rejects(paymentService.refundDeposit(state.booking.reference,owner),error=>error===failure);
  assert.deepEqual(state.events,[]);assert.deepEqual(state.notices,[]);assert.deepEqual(state.statements,['BEGIN','ROLLBACK']);
});

for(const operation of ['holds','rent','checkout'] as const){
  test(`${operation} notification claim with a missing bulk context rolls back before any outbox batch`,async(t)=>{
    const {statements}=transaction(t);let queued=0;
    t.mock.method(bookingRepository,'claimHoldsEndingSoon',async()=>[id(0),id(1)]);
    t.mock.method(bookingRepository,'claimRentRequests',async()=>[id(0),id(1)]);
    t.mock.method(bookingRepository,'claimCheckoutReminders',async()=>[id(0)]);
    t.mock.method(bookingRepository,'claimLateCheckoutAlerts',async()=>[id(1)]);
    t.mock.method(bookingRepository,'emailContexts',async()=>[context(0)]);
    t.mock.method(emailService,'queueHoldEndingReminders',async()=>{queued++;});
    t.mock.method(emailService,'queueRentRequests',async()=>{queued++;});
    t.mock.method(emailService,'queueCheckoutReminders',async()=>{queued++;});
    t.mock.method(emailService,'queueLateCheckoutAlerts',async()=>{queued++;});
    const action=operation==='holds'?bookingService.remindOwnerOfEndingHolds:operation==='rent'?bookingService.sendRentRequests:bookingService.sendCheckoutNotifications;
    await assert.rejects(action(),/missing notification context/i);
    assert.equal(queued,0);assert.deepEqual(statements,['BEGIN','ROLLBACK']);
  });
}
