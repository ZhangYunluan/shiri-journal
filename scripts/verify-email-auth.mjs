import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';

process.env.PORT = '4216';
process.env.HOST = '127.0.0.1';
await import('../preview-server.mjs');
const origin = 'http://127.0.0.1:4216';
const browser = await launchBrowser();
const errors = [];
try {
  for (const mode of ['signup', 'signin', 'rate', 'captcha']) {
    const context = await browser.newContext({serviceWorkers: 'block'});
    const calls = [];
    let registered = mode !== 'signup';
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      const body = route.request().postData() ? route.request().postDataJSON() : {};
      calls.push({path: url.pathname, body});
      assert.ok(!/shiri-ai|shiri-media/.test(url.pathname));
      let data = {}, status = 200;
      if (url.pathname.endsWith('/verification')) {
        await new Promise(resolve => setTimeout(resolve, 40));
        data = {verification_id: 'fixture', is_user: registered, expires_in: 600};
        if (mode === 'rate' || mode === 'captcha') {
          status = 400;
          data = {error: mode === 'rate' ? 'rate_limit_exceeded' : 'captcha_required'};
        }
      }
      if (url.pathname.endsWith('/verification/verify')) {
        if (body.verification_code === '123456') data = {verification_token: 'verified'};
        else {
          status = 400;
          data = {error: body.verification_code === '000000' ? 'invalid_verification_code' : 'verification_expired'};
        }
      }
      if (/\/(signin|signup|token)$/.test(url.pathname)) {
        data = {access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 7200, sub: 'email-audit-fixture'};
        registered = true;
      }
      if (url.pathname.endsWith('/user/me')) data = {sub: 'email-audit-fixture', email: 'display@example.invalid', nickName: '合成测试用户'};
      if (url.pathname.endsWith('/shiri_social')) {
        assert.ok(!/^publish_/.test(body.p_action || ''));
        data = {friends: [{id: 'fixture-friend', nickname: '合成好友', scope: 'none', categories: []}], incoming: [], outgoing: [], blocked: [], mine: [], records: [], hasMore: false};
      }
      await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(data)});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function login(email) {
      await page.locator('[name=email]').fill(email);
      await page.locator('[data-cloud-form=send] button').first().evaluate(button => { button.click(); button.click(); });
    }
    await page.goto(origin);
    await login('Ab.C+Tag@EXAMPLE.invalid');
    if (mode === 'rate' || mode === 'captcha') {
      const expected = mode === 'rate' ? '频繁' : '人机';
      await page.waitForFunction(text => document.querySelector('#main').textContent.includes(text), expected);
      assert.equal(await page.locator('[name=code]').count(), 0);
      assert.equal(calls.filter(c => /\/(signin|signup)$/.test(c.path)).length, 0);
    } else {
      await page.locator('[name=code]').waitFor();
      assert.equal(await page.locator('[name=email]').inputValue(), 'Ab.C+Tag@example.invalid');
      for (const [code, message] of [['000000', '验证码错误'], ['000001', '验证码已过期']]) {
        await page.locator('[name=code]').fill(code);
        await page.locator('[data-cloud-form=verify] button').click();
        await page.waitForFunction(text => document.querySelector('#main').textContent.includes(text), message);
      }
      await page.locator('[name=code]').fill('123456');
      await page.locator('[data-cloud-form=verify] button').evaluate(button => { button.click(); button.click(); });
      await page.waitForSelector('[data-action=note]');
      assert.equal(calls.filter(c => c.path.endsWith('/verification')).length, 1);
      assert.equal(calls.filter(c => /\/(signin|signup)$/.test(c.path)).length, 1);
      await page.locator('[data-action=note]').first().click();
      await page.locator('[name=title]').fill('合成私密记录');
      await page.locator('.record-sharing summary').click();
      await page.locator('[name=visibility]').selectOption('self');
      await page.locator('#record-form [type=submit]').click();
      await page.waitForFunction(() => !document.querySelector('#editor-dialog').open);
      const before = await page.evaluate(async () => ({owner: localStorage.getItem('shiri-space-owner'), records: (await (await import('/src/db.mjs')).readAll()).records.map(r => r.id)}));
      await page.goto(origin + '/#friends');
      await page.waitForSelector('[data-cloud-auth=logout]', {state: 'attached'});
      await page.locator('.account-details').evaluate(node => { node.open = true; });
      await page.locator('[data-cloud-auth=logout]').click();
      await page.locator('[name=email]').waitFor();
      await login('ab.c+tag@EXAMPLE.invalid');
      await page.locator('[name=code]').fill('123456');
      await page.locator('[data-cloud-form=verify] button').click();
      await page.waitForSelector('[data-cloud-auth=logout]', {state: 'attached'});
      await page.locator('[data-friends-view=people]').click();
      await page.waitForFunction(() => document.querySelector('#main').textContent.includes('合成好友'));
      const after = await page.evaluate(async () => ({owner: localStorage.getItem('shiri-space-owner'), records: (await (await import('/src/db.mjs')).readAll()).records.map(r => r.id)}));
      assert.deepEqual(after, before);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS synthetic UI signup/login, domain normalization, duplicate clicks, wrong/expired codes, rate/captcha errors, stable UID diary space and friend display. CloudBase case rules and real rate limits remain untested.');
} finally {
  await browser.close();
}
process.exit(0);
