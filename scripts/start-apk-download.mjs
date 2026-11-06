/** Standalone APK-only delivery. No login tokens, source files or diaries are served. */
import {resolve} from 'node:path';
import {networkInterfaces} from 'node:os';
import {createDownloadServer} from '../android-shell/scripts/serve-apk.mjs';

const name='shiri-0.6.1-release.apk',port=4198;
const apk=resolve(import.meta.dirname,'../releases',name);
const server=await createDownloadServer(apk,{name,version:'0.6.1',authConnected:true,socialIncluded:true,nicknameSearchIncluded:true});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'
    ? `Port ${port} is already in use. Check http://127.0.0.1:${port}/ before starting another copy.`
    : `Download service failed: ${error.code||error.message}`);
  process.exitCode=1;
});
server.listen(port,'0.0.0.0',()=>{
  console.log(`Desktop download page: http://127.0.0.1:${port}/`);
  for(const [adapter,addresses] of Object.entries(networkInterfaces())){
    for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal)
      console.log(`Phone (${adapter}, same Wi-Fi): http://${address.address}:${port}/`);
  }
  console.log('Keep this process/window and computer running while downloading.');
  console.log('APK installation must be completed on an Android phone.');
});
