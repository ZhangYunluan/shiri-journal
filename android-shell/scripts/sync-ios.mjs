import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const shell=fileURLToPath(new URL('..',import.meta.url));
// New collaborators default to an isolated environment. --release is an explicit
// owner choice of the existing public production configuration, not a deployment.
const profile=process.argv.includes('--release')?'release':'debug';
for(const args of [['scripts/prepare-web.mjs'],['node_modules/@capacitor/cli/bin/capacitor','sync','ios']]){
 const run=spawnSync(process.execPath,args,{cwd:resolve(shell),stdio:'inherit',env:{...process.env,SHIRI_PLATFORM:'ios',SHIRI_BUILD_PROFILE:profile}});
 if(run.error)throw run.error;if(run.status!==0)process.exit(run.status||1);
}
