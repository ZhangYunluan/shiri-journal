import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudbaseAuth, localCloudSpace} from '../src/cloudbase-auth.mjs';

// All endpoints and addresses here are synthetic. These tests do not establish
// CloudBase's deployed mailbox case-folding or production rate-limit behavior.
const envId = 'email-security-fixture';
const config = {
  envId,
  publishableKey: 'e30.' + Buffer.from(JSON.stringify({role: 'anon', aud: envId})).toString('base64url') + '.public',
};

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

function fixture() {
  const calls = [];
  let saved = null;
  let clock = 1000;
  const state = {sendGate: null, verifyGate: null, sendError: null, verifyError: null, email: 'Display@example.invalid'};
  const vault = {
    get: async () => saved,
    set: async value => { saved = value; },
    clear: async () => { saved = null; },
  };
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({path, body});
    if (path.endsWith('/verification')) {
      await state.sendGate?.promise;
      if (state.sendError) return Response.json(state.sendError, {status: 400});
      return Response.json({verification_id: 'challenge-' + calls.filter(c => c.path.endsWith('/verification')).length, is_user: state.existing !== false, expires_in: 600});
    }
    if (path.endsWith('/verification/verify')) {
      await state.verifyGate?.promise;
      if (state.verifyError) return Response.json(state.verifyError, {status: 400});
      if (body.verification_id !== 'challenge-1' && body.verification_code === '111111') {
        return Response.json({error: 'invalid_verification_code'}, {status: 400});
      }
      return Response.json({verification_token: 'verified-fixture'});
    }
    if (path.endsWith('/signin') || path.endsWith('/signup')) {
      assert.equal(body.verification_token, 'verified-fixture');
      return Response.json({access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 7200, sub: 'stable-uid'});
    }
    if (path.endsWith('/user/me')) return Response.json({sub: 'stable-uid', email: state.email});
    throw Error('Unexpected synthetic auth endpoint');
  };
  const auth = createCloudbaseAuth({config, vault, fetcher, now: () => clock});
  return {auth, calls, state, vault, advance: ms => { clock += ms; }, stored: () => saved};
}

test('trim boundary whitespace and fold only domain, preserving local dots, tags and case', async () => {
  const f = fixture();
  f.state.existing = false;
  const challenge = await f.auth.sendCode('  Ab.C+Tag@EXAMPLE.invalid \t');
  assert.equal(challenge.email, 'Ab.C+Tag@example.invalid');
  assert.deepEqual(f.calls[0].body, {email: 'Ab.C+Tag@example.invalid', target: 'ANY'});
  await f.auth.verifyCode('123456');
  assert.deepEqual(f.calls.find(c => c.path.endsWith('/signup')).body, {email: challenge.email, verification_token: 'verified-fixture'});
});

test('concurrent case variants produce one in-flight send per auth instance', async () => {
  const f = fixture();
  f.state.sendGate = deferred();
  const results = Promise.allSettled([
    f.auth.sendCode('Case@example.invalid'),
    f.auth.sendCode('case@EXAMPLE.invalid'),
  ]);
  await Promise.resolve();
  f.state.sendGate.resolve();
  const settled = await results;
  assert.equal(f.calls.filter(c => c.path.endsWith('/verification')).length, 1);
  assert.deepEqual(settled.map(r => r.status), ['fulfilled', 'rejected']);
});

test('concurrent verification submits the challenge and signs in once', async () => {
 for (const existing of [true, false]) {
  const f = fixture();
  f.state.existing = existing;
  await f.auth.sendCode('Case@example.invalid');
  f.state.verifyGate = deferred();
  const results = Promise.allSettled([f.auth.verifyCode('123456'), f.auth.verifyCode('123456')]);
  await Promise.resolve();
  f.state.verifyGate.resolve();
  const settled = await results;
  assert.equal(f.calls.filter(c => c.path.endsWith('/verification/verify')).length, 1);
  assert.equal(f.calls.filter(c => /\/(signup|signin)$/.test(c.path)).length, 1);
  assert.deepEqual(settled.map(r => r.status), ['fulfilled', 'rejected']);
 }
});

test('a new email send cannot replace the challenge while verification is pending', async () => {
  const f = fixture();
  await f.auth.sendCode('First@example.invalid');
  f.advance(61000);
  f.state.verifyGate = deferred();
  const verifying = f.auth.verifyCode('123456');
  const sending = f.auth.sendCode('Second@example.invalid');
  const results = Promise.allSettled([verifying, sending]);
  f.state.verifyGate.resolve();
  const settled = await results;
  assert.equal(settled[1].status, 'rejected');
  assert.equal(f.calls.filter(c => c.path.endsWith('/verification')).length, 1);
});

test('logout invalidates a delayed send and cannot leave a usable stale challenge', async () => {
  const f = fixture();
  f.state.sendGate = deferred();
  const sending = f.auth.sendCode('Case@example.invalid');
  const result = Promise.allSettled([sending]);
  await f.auth.logout({localOnly: true});
  f.state.sendGate.resolve();
  assert.equal((await result)[0].status, 'rejected');
  await assert.rejects(f.auth.verifyCode('123456'), /重新发送/);
  assert.equal(f.stored(), null);
});

test('logout during verification stops before an obsolete signin or signup', async () => {
  const f = fixture();
  await f.auth.sendCode('Case@example.invalid');
  f.state.verifyGate = deferred();
  const result = Promise.allSettled([f.auth.verifyCode('123456')]);
  await f.auth.logout({localOnly: true});
  f.state.verifyGate.resolve();
  assert.equal((await result)[0].status, 'rejected');
  assert.equal(f.calls.filter(c => /\/(signup|signin)$/.test(c.path)).length, 0);
  assert.equal(f.stored(), null);
});

test('official rate and captcha errors produce specific safe messages and no session', async () => {
  for (const [code, expected] of [
    ['rate_limit_exceeded', /频繁/],
    ['resource_exhausted', /频繁/],
    ['captcha_required', /人机|图形/],
    ['captcha_invalid', /人机|图形/],
  ]) {
    const f = fixture();
    f.state.sendError = {error: code};
    await assert.rejects(f.auth.sendCode('Case@example.invalid'), expected);
    assert.equal(f.stored(), null);
    await assert.rejects(f.auth.verifyCode('123456'), /重新发送/);
  }
});

test('wrong and expired verification remain errors and never reach signup/signin', async () => {
  const f = fixture();
  await f.auth.sendCode('Case@example.invalid');
  f.state.verifyError = {error: 'invalid_verification_code'};
  await assert.rejects(f.auth.verifyCode('000000'), /验证码/);
  f.state.verifyError = {error: 'verification_expired'};
  await assert.rejects(f.auth.verifyCode('123456'), /过期|重新发送/);
  assert.equal(f.stored(), null);
  assert.equal(f.calls.filter(c => /\/(signup|signin)$/.test(c.path)).length, 0);
  f.advance(601000);
  const before = f.calls.length;
  await assert.rejects(f.auth.verifyCode('123456'), /重新发送/);
  assert.equal(f.calls.length, before);
});

test('a later challenge binds the new email and request ID, while a rejected older code cannot log in', async () => {
  const f = fixture();
  f.state.existing = false;
  await f.auth.sendCode('First@example.invalid');
  f.advance(61000);
  await f.auth.sendCode('Second@example.invalid');
  await assert.rejects(f.auth.verifyCode('111111'), /验证码/);
  assert.equal(f.stored(), null);
  await f.auth.verifyCode('222222');
  const verify = f.calls.filter(c => c.path.endsWith('/verification/verify'));
  assert.ok(verify.every(c => c.body.verification_id === 'challenge-2'));
  assert.equal(f.calls.find(c => c.path.endsWith('/signup')).body.email, 'Second@example.invalid');
});

test('synthetic server-verified UID determines space across profile email variants', async () => {
  const f = fixture();
  await f.auth.sendCode('Case@example.invalid');
  const before = await f.auth.verifyCode('123456');
  f.state.email = 'DISPLAY@EXAMPLE.invalid';
  const after = await f.auth.restore();
  assert.equal(after.user.id, before.user.id);
  assert.equal(localCloudSpace(after.user.id), localCloudSpace(before.user.id));
});
