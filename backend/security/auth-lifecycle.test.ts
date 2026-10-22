/** Synthetic lifecycle races and atomicity checks; this mutex models row locking, not PostgreSQL. */
import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { createHash, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Db } from '../src/db/pool.js';
import type { OutgoingEmail } from '../src/modules/notifications/email.repository.js';

Object.assign(process.env,{
  NODE_ENV:'test',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',DB_TRANSPORT:'tcp',DB_SSL:'false',
  SITE_URL:'https://example.invalid',JOBS_ENABLED:'false',BOOKING_TOKEN_SECRET:'synthetic-booking-token-secret-for-auth-tests',
  GUEST_IDENTITY_ENCRYPTION_KEY:'synthetic-identity-secret-for-auth-tests',EMAIL_FROM:'test@example.invalid',OWNER_EMAIL:'owner@example.invalid',
  RESEND_API_KEY:'',BANK_BIN:'970436',BANK_NAME:'Synthetic',BANK_ACCOUNT_NUMBER:'0000000000',BANK_ACCOUNT_NAME:'SYNTHETIC',
});
const {pool}=await import('../src/db/pool.js');
const {adminAuthRepository:repository}=await import('../src/modules/admin-auth/admin-auth.repository.js');
const {adminAuthService:service}=await import('../src/modules/admin-auth/admin-auth.service.js');
const {emailRepository}=await import('../src/modules/notifications/email.repository.js');
const {emailService}=await import('../src/modules/notifications/email.service.js');
const {hashPassword,verifyPassword,needsPasswordRehash}=await import('../src/modules/admin-auth/password.js');
const forbidIO=async():Promise<never>=>{throw new Error('Authentication harness forbids unmocked I/O');};
pool.query=forbidIO;pool.connect=forbidIO;globalThis.fetch=forbidIO;
after(async()=>{await pool.end();});
const owner={id:'00000000-0000-0000-0000-000000000001',name:'Synthetic Owner',email:'owner@example.invalid'};
const oldPassword='Synthetic-River-93!';const newPassword='Synthetic-Mountain-47!';
const currentHash=await hashPassword(oldPassword);
const salt=Buffer.alloc(16,8);
const legacyHash=['scrypt',32768,8,1,salt.toString('base64'),scryptSync(oldPassword,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('base64')].join('$');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const keepToken='synthetic-owner-current-session';const keepHash=sha(keepToken);const otherHash=sha('synthetic-other-session');
const clientInfo={ip:'192.0.2.1',userAgent:'Synthetic auth lifecycle test'};
const unauthorized=(error:unknown)=>!!error&&typeof error==='object'&&'code'in error&&error.code==='UNAUTHORIZED';
function gate(){let open!:()=>void;const promise=new Promise<void>(resolve=>{open=resolve;});return {promise,open};}

type Failure='updatePassword'|'deleteOtherSessions'|'enqueue'|'upgradePasswordHash'|'createSession'|'recordLogin'|'COMMIT';
type State={password:string;sessions:Set<string>;outbox:OutgoingEmail[];logins:number};
type Tx=State&{locked:boolean;unlock?:()=>void;done:boolean};
function model(t:TestContext,password=currentHash,failAt?:Failure,beforeCommit?:{entered:ReturnType<typeof gate>;resume:ReturnType<typeof gate>}){
  const state:State={password,sessions:new Set([keepHash,otherHash]),outbox:[],logins:0};
  const trace:string[]=[];const transactions=new WeakMap<object,Tx>();let tail=Promise.resolve();
  const hooks:{onFindByEmail?:(row:typeof owner&{password_hash:string})=>Promise<typeof owner&{password_hash:string}>;onUnlockedFindById?:()=>void;afterCreateSession?:()=>Promise<void>}={};
  const failure=new Error(`Synthetic failure at ${failAt??'none'}`);
  const fail=(stage:Failure)=>{if(failAt===stage)throw failure;};
  const snapshot=()=>({...owner,password_hash:state.password});
  const transaction=(db:Db|undefined)=>{assert.ok(db,'credential mutation escaped its transaction');const tx=transactions.get(db);assert.ok(tx?.locked,'account row must be locked before credential/session writes');return tx;};
  const unlock=(tx:Tx)=>{tx.unlock?.();tx.unlock=undefined;};
  t.mock.method(pool,'connect',async()=>{
    const tx:Tx={password:'',sessions:new Set(),outbox:[],logins:0,locked:false,done:false};
    const db={query:async(sql:string)=>{
      trace.push(sql);
      if(sql==='BEGIN')return {rows:[]};
      if(sql==='COMMIT'){
        if(beforeCommit){beforeCommit.entered.open();await beforeCommit.resume.promise;}
        fail('COMMIT');assert.ok(tx.locked);state.password=tx.password;state.sessions=new Set(tx.sessions);state.outbox=[...tx.outbox];state.logins=tx.logins;tx.done=true;unlock(tx);return {rows:[]};
      }
      assert.equal(sql,'ROLLBACK');tx.done=true;unlock(tx);return {rows:[]};
    },release:()=>{assert.ok(tx.done,'transaction connection released without completion');unlock(tx);}};
    transactions.set(db,tx);return db;
  });
  t.mock.method(repository,'findByEmail',async()=>{const row=snapshot();return hooks.onFindByEmail?hooks.onFindByEmail(row):row;});
  t.mock.method(repository,'findById',async(_id:string,db?:Db,lock=false)=>{
    if(!db){assert.equal(lock,false);const row=snapshot();hooks.onUnlockedFindById?.();return row;}
    assert.equal(lock,true,'recheck must lock the account row');const tx=transactions.get(db);assert.ok(tx);
    const previous=tail;const next=gate();tail=next.promise;await previous;tx.unlock=next.open;tx.locked=true;
    tx.password=state.password;tx.sessions=new Set(state.sessions);tx.outbox=[...state.outbox];tx.logins=state.logins;trace.push('LOCK');
    return {...owner,password_hash:tx.password};
  });
  t.mock.method(repository,'updatePassword',async(_id:string,passwordHash:string,db:Db)=>{const tx=transaction(db);fail('updatePassword');trace.push('updatePassword');tx.password=passwordHash;});
  t.mock.method(repository,'upgradePasswordHash',async(_id:string,previous:string,next:string,db:Db)=>{const tx=transaction(db);fail('upgradePasswordHash');assert.equal(tx.password,previous);trace.push('upgradePasswordHash');tx.password=next;return true;});
  t.mock.method(repository,'createSession',async(_id:string,tokenHash:string,_hours:number,_ip:string|undefined,_agent:string|undefined,db:Db)=>{const tx=transaction(db);fail('createSession');trace.push('createSession');tx.sessions.add(tokenHash);await hooks.afterCreateSession?.();return new Date('2090-01-01');});
  t.mock.method(repository,'recordLogin',async(_id:string,db:Db)=>{const tx=transaction(db);fail('recordLogin');trace.push('recordLogin');tx.logins++;});
  t.mock.method(repository,'deleteOtherSessions',async(_id:string,keep:string,db?:Db)=>{const tx=transaction(db);fail('deleteOtherSessions');assert.equal(keep,keepHash);trace.push('deleteOtherSessions');tx.sessions=new Set([...tx.sessions].filter(hash=>hash===keep));});
  // Keep the real notification renderer so missing db propagation to enqueue fails this check.
  t.mock.method(emailRepository,'enqueue',async(email:OutgoingEmail,db?:Db)=>{const tx=transaction(db);fail('enqueue');trace.push('enqueue');tx.outbox.push(email);});
  return {state,trace,failure,snapshot,hooks};
}
const change=(next=newPassword)=>service.changePassword(owner,keepToken,{currentPassword:oldPassword,newPassword:next},clientInfo);

test('password change atomically replaces credentials, revokes other sessions and enqueues one notice while preserving current session',async(t)=>{
  const m=model(t);await change();
  assert.equal(await verifyPassword(newPassword,m.state.password),true);assert.equal(await verifyPassword(oldPassword,m.state.password),false);
  assert.deepEqual([...m.state.sessions],[keepHash]);assert.equal(m.state.outbox.length,1);assert.equal(m.state.outbox[0].to,owner.email);
  assert.deepEqual(m.trace,['BEGIN','LOCK','updatePassword','deleteOtherSessions','enqueue','COMMIT']);
});

for(const stage of ['updatePassword','deleteOtherSessions','enqueue','COMMIT'] as const){
  test(`password change failure at ${stage} restores hash, all sessions and outbox`,async(t)=>{
    const m=model(t,currentHash,stage);await assert.rejects(change(),error=>error===m.failure);
    assert.equal(m.state.password,currentHash);assert.deepEqual([...m.state.sessions],[keepHash,otherHash]);assert.deepEqual(m.state.outbox,[]);
    assert.equal(m.trace.at(-1),'ROLLBACK');
  });
}

test('a password change that wins the lock prevents an old verified login snapshot from issuing any new session',async(t)=>{
  const m=model(t);const read=gate();const resume=gate();
  m.hooks.onFindByEmail=async snapshot=>{read.open();await resume.promise;return snapshot;};
  const login=service.login(owner.email,oldPassword,clientInfo);const outcome=assert.rejects(login,unauthorized);
  await read.promise;await change();resume.open();await outcome;
  assert.equal(await verifyPassword(newPassword,m.state.password),true);assert.deepEqual([...m.state.sessions],[keepHash]);
  assert.equal(m.trace.filter(event=>event==='createSession').length,0);assert.equal(m.trace.at(-1),'ROLLBACK');
});

test('a login that wins the account lock commits first and its issued session is revoked by the subsequent password change',async(t)=>{
  const m=model(t);const entered=gate();const resume=gate();const read=gate();
  m.hooks.afterCreateSession=async()=>{entered.open();await resume.promise;};
  m.hooks.onUnlockedFindById=read.open;
  const login=service.login(owner.email,oldPassword,clientInfo);await entered.promise;
  const passwordChange=change();await read.promise;resume.open();
  const result=await login;await passwordChange;
  assert.ok(!m.state.sessions.has(sha(result.token)));assert.deepEqual([...m.state.sessions],[keepHash]);assert.equal(m.state.logins,1);
  assert.equal(await verifyPassword(newPassword,m.state.password),true);assert.equal(m.trace.filter(event=>event==='COMMIT').length,2);
});

test('concurrent password changes verified against one old snapshot allow only one transaction to commit',async(t)=>{
  const m=model(t);const results=await Promise.allSettled([change(),change('Synthetic-Orchard-68!')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const rejected=results.find(result=>result.status==='rejected');assert.ok(rejected?.status==='rejected'&&unauthorized(rejected.reason));
  assert.equal(m.state.outbox.length,1);assert.deepEqual([...m.state.sessions],[keepHash]);
  assert.equal(m.trace.filter(event=>event==='COMMIT').length,1);assert.equal(m.trace.filter(event=>event==='ROLLBACK').length,1);
});

for(const stage of ['upgradePasswordHash','createSession','recordLogin','COMMIT'] as const){
  test(`legacy login failure at ${stage} rolls back both cost upgrade and any inserted session`,async(t)=>{
    const m=model(t,legacyHash,stage);let issued=false;
    await assert.rejects(service.login(owner.email,oldPassword,clientInfo).then(result=>{issued=true;return result;}),error=>error===m.failure);
    assert.equal(issued,false);assert.equal(m.state.password,legacyHash);assert.deepEqual([...m.state.sessions],[keepHash,otherHash]);
    assert.equal(m.state.logins,0);assert.deepEqual(m.state.outbox,[]);assert.equal(m.trace.at(-1),'ROLLBACK');
  });
}

test('successful legacy login commits upgraded credentials and hashed session together before returning its bearer token',async(t)=>{
  const m=model(t,legacyHash);const result=await service.login(owner.email,oldPassword,clientInfo);
  assert.equal(needsPasswordRehash(m.state.password),false);assert.equal(await verifyPassword(oldPassword,m.state.password),true);
  assert.ok(m.state.sessions.has(sha(result.token)));assert.ok(!m.state.sessions.has(result.token));
  assert.equal(m.state.logins,1);assert.equal(m.trace.at(-1),'COMMIT');
  assert.deepEqual(m.trace,['BEGIN','LOCK','upgradePasswordHash','createSession','recordLogin','COMMIT']);
});

test('credential repository mutations and password notice use the supplied transaction rather than the shared pool',async()=>{
  const queries:{sql:string;values:unknown[]}[]=[];
  const db={query:async(sql:string,values:unknown[])=>{queries.push({sql,values});return {rows:sql.includes('RETURNING expires_at')?[{expires_at:new Date('2090-01-01')}]:[{...owner,password_hash:currentHash}]};}} as unknown as Db;
  await repository.findById(owner.id,db,true);
  await repository.updatePassword(owner.id,currentHash,db);
  assert.equal(await repository.upgradePasswordHash(owner.id,legacyHash,currentHash,db),true);
  await repository.createSession(owner.id,keepHash,12,undefined,'x'.repeat(600),db);
  await repository.recordLogin(owner.id,db);
  await repository.deleteOtherSessions(owner.id,keepHash,db);
  await emailService.queueAdminPasswordChanged({...owner,...clientInfo,at:new Date('2026-10-23')},db);
  assert.equal(queries.length,7);assert.match(queries[0].sql,/FOR UPDATE$/i);
  assert.match(queries[2].sql,/password_hash = \$2/);assert.deepEqual(queries[2].values,[owner.id,legacyHash,currentHash]);
  assert.equal(queries[3].values[1],keepHash);assert.equal(String(queries[3].values[4]).length,500);
  assert.match(queries[5].sql,/token_hash <> \$2/);assert.deepEqual(queries[5].values,[owner.id,keepHash]);
  assert.match(queries[6].sql,/INSERT INTO email_outbox/);assert.equal(queries[6].values[0],owner.email);
});

test('root ignore rules cover environment variants throughout the repository while allowing documented templates',()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const ignored=['.env','.env.production','.env.local','backend/.env.production','backend/.env.local','frontend/real-estate/.env.production','frontend/real-estate/.env.local'];
  const templates=['.env.example','.env.sample','.env.template','backend/.env.production.example','frontend/real-estate/.env.example'];
  const result=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:root,input:[...ignored,...templates].join('\n')+'\n',encoding:'utf8'});
  assert.equal(result.status,0);const matches=new Set(result.stdout.trim().split('\n'));
  for(const path of ignored)assert.ok(matches.has(path),`${path} is not ignored`);
  for(const path of templates)assert.ok(!matches.has(path),`${path} template should remain eligible for version control`);
});

test('a legacy login exposes neither its bearer result nor staged credential/session changes while COMMIT is pending',async(t)=>{
  const entered=gate();const resume=gate();const m=model(t,legacyHash,undefined,{entered,resume});let returned=false;
  const login=service.login(owner.email,oldPassword,clientInfo).then(result=>{returned=true;return result;});
  await entered.promise;
  assert.equal(returned,false);assert.equal(m.state.password,legacyHash);assert.deepEqual([...m.state.sessions],[keepHash,otherHash]);assert.equal(m.state.logins,0);
  resume.open();const result=await login;
  assert.equal(returned,true);assert.equal(needsPasswordRehash(m.state.password),false);assert.ok(m.state.sessions.has(sha(result.token)));assert.equal(m.state.logins,1);
});
