/** Only public settings can pass validation and enter browser/APK sources. */
import {readFile,writeFile} from 'node:fs/promises';
import {validateCloudConfig} from '../src/cloudbase-auth.mjs';
const root=new URL('../',import.meta.url),file=new URL('cloudbase/.env',root);
let env={};
try {for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){
  const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)env[match[1]]=match[2].trim();
}}catch(error){if(error.code!=='ENOENT')throw error;}
const get=key=>process.env[key]||env[key]||'';
const config={envId:get('SHIRI_CLOUDBASE_ENV_ID'),region:'ap-shanghai',publishableKey:get('SHIRI_CLOUDBASE_PUBLISHABLE_KEY'),testUrl:get('SHIRI_CLOUDBASE_TEST_URL'),friendsEnabled:true};
const origin=validateCloudConfig(config);
if(config.testUrl){const url=new URL(config.testUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Test URL must be public HTTPS');}
// JSON is written to a file, never interpreted as shell command text.
await writeFile(new URL('src/cloudbase-config.mjs',root),'/** Public CloudBase settings; never include administrator credentials. */\nexport const CLOUDBASE = Object.freeze('+JSON.stringify(config,null,2)+');\n');
const htmlURL=new URL('index.html',root);let html=await readFile(htmlURL,'utf8');
html=html.replace(/connect-src ([^;]+);/,`connect-src 'self' blob: ${origin};`);
await writeFile(htmlURL,html);
console.log('Validated public configuration and updated CSP. Key value is not logged.');
