/** Authentication storage is deliberately separate from diary databases/backups. */
export function createAuthVault(native=globalThis.window?.shiriNative?.auth) {
  if(native)return {get:async()=>{const {value}=await native.get();return value?JSON.parse(value):null;},set:session=>native.set({value:JSON.stringify(session)}),clear:()=>native.clear()};
  let connection;
  async function database(){
    if(!connection)connection=new Promise((resolve,reject)=>{
      const req=indexedDB.open('shiri-cloudbase-auth-v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('session');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    return connection;
  }
  async function execute(mode,work){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('session',mode),req=work(tx.objectStore('session'));let result;
      req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>resolve(result??null);tx.onabort=()=>reject(tx.error||Error('会话保存失败'));tx.onerror=()=>{};
    });
  }
  return {get:()=>execute('readonly',s=>s.get('current')),set:v=>execute('readwrite',s=>s.put(v,'current')),clear:()=>execute('readwrite',s=>s.delete('current'))};
}
