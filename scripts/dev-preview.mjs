import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const result=spawnSync(process.execPath,[resolve(root,'android-shell/scripts/prepare-web.mjs')],{stdio:'inherit',env:{...process.env,SHIRI_BUILD_PROFILE:'debug'}});
if(result.status!==0)process.exit(result.status||1);
process.chdir(resolve(root,'android-shell/www'));
process.env.PORT=process.env.PORT||'4177';
process.env.HOST='127.0.0.1';
await import('../preview-server.mjs');
