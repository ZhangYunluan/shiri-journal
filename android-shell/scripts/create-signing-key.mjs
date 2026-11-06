// Generates a reusable private release key locally. Never include .signing in any upload.
import {mkdir,access,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'), directory=join(root,'.signing');
const key=join(directory,'shiri-release.jks'), config=join(directory,'signing.properties');
const exists=path=>access(path).then(()=>true,()=>false);
if (await exists(key) || await exists(config)) {
  if (!await exists(key) || !await exists(config)) throw Error('Signing files are incomplete. Restore them; do not replace the release identity.');
  console.log('Existing release identity retained.');
  process.exit(0);
}
if (!process.env.JAVA_HOME) throw Error('Set JAVA_HOME to the verified JDK directory.');
await mkdir(directory,{recursive:true});
const password=randomBytes(32).toString('hex');
const result=spawnSync(join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'keytool.exe':'keytool'),[
  '-genkeypair','-keystore',key,'-storetype','JKS','-alias','shiri-release',
  '-keyalg','RSA','-keysize','3072','-validity','10000',
  '-dname','CN=Shiri Release','-storepass:env','SHIRI_KEY_PASSWORD','-keypass:env','SHIRI_KEY_PASSWORD',
],{env:{...process.env,SHIRI_KEY_PASSWORD:password},encoding:'utf8'});
if (result.status!==0) throw Error(result.stderr || 'keytool failed');
await writeFile(config,`storePassword=${password}\nkeyPassword=${password}\nkeyAlias=shiri-release\n`,{mode:0o600,flag:'wx'});
console.log('Release key generated in android-shell/.signing. Back up both files privately before distributing updates.');
