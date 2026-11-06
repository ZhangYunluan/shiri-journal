import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
// No dependency on Codex's installation directory. Override only for a locally installed browser.
export async function launchBrowser() {
  await mkdir('releases',{recursive:true});
  return chromium.launch({headless:true,...(process.env.SHIRI_BROWSER_PATH?{executablePath:process.env.SHIRI_BROWSER_PATH}:{})});
}
