import {isSyncable} from './moment-review.mjs';
import {shareProjection,sharingJpeg} from './cloudbase-social-api.mjs';

/** Durable per-record queue. Remote IDs survive interruption; retries reuse the same photo. */
export function createMomentSync({store,api,auth,online=()=>navigator.onLine,jpeg=sharingJpeg,changed=()=>{},now=()=>Date.now()}){
  let running=null;
  const allowed=(friends,r)=>friends.some(f=>f.scope==='all'||f.scope==='shared'||f.scope==='categories'&&f.categories?.includes(r.categoryId));
  async function drain(force){
    const uid=auth.session?.user.id;if(!uid||!online())return;
    const same=()=>auth.session?.user.id===uid;
    const rows=await store.list();let dashboard;
    try{
      for(const job of await store.revocations()){
        if(!same())return;
        await api.rpc('revoke_local',{localId:job.id});await store.doneRevocation(job.id);
      }
      if(!rows.some(r=>isSyncable(r)&&r.cloudSync?.state!=='synced'))return;
      dashboard=await api.rpc('dashboard');if(!same())return;
    }catch(error){
      for(const r of rows){
        if(!same())return;
        if(isSyncable(r)&&r.cloudSync&&r.cloudSync.state!=='synced')
          await store.patch(r.id,r.cloudSync.revision,{state:'pending',stage:'prepare',error:error.message,errorStatus:error.status||0,errorCode:error.code||''});
      }
      changed();return;
    }
    for(const candidate of rows){
      let r=await store.get(candidate.id),q=r?.cloudSync;
      if(!same()||!online())return;
      if(!isSyncable(r)||!q||q.state==='synced'||!force&&q.nextAt>now())continue;
      if(!allowed(dashboard.friends||[],r)){await store.patch(r.id,q.revision,{state:'waiting',error:'',errorStatus:0,errorCode:''});changed();continue;}
      const id=r.id,revision=q.revision;
      const current=async()=>{const latest=await store.get(id);return same()&&isSyncable(latest)&&latest.cloudSync?.revision===revision;};
      let stage='begin';
      try{
        await store.patch(id,revision,{state:'syncing',stage,error:'',errorStatus:0,errorCode:''});changed();
        const category=(await store.categories()).find(c=>c.id===r.categoryId);
        const asset=r.assetId?await store.asset(r.assetId):null;
        if(r.assetId&&!asset)throw Error('本机照片缺失，请恢复备份');
        let remote=q.remote;
        if(remote&&q.startedAt&&now()-q.startedAt>5*3600000){remote=null;await store.patch(id,revision,{remote:null,uploaded:false});q={...q,uploaded:false};}
        if(!remote){
          if(!await current())continue;
          remote=await api.rpc('publish_begin',shareProjection(r,category,{photo:!!asset}));
          await store.patch(id,revision,{remote,uploaded:false,startedAt:now()});
        }
        if(!await current()){if(same())await api.rpc('revoke_local',{localId:id});continue;}
        if(asset&&!q.uploaded){
          stage='compress';const blob=await jpeg(asset.blob);
          if(!await current())continue;
          stage='upload';
          await api.upload(remote.mediaId,blob,progress=>{store.patch(id,revision,{progress}).then(changed).catch(()=>{});});
          await store.patch(id,revision,{uploaded:true,progress:100});
        }
        if(!await current()){if(same())await api.rpc('revoke_local',{localId:id});continue;}
        stage='finish';
        await api.rpc('publish_finish',{id:remote.id,publishToken:remote.publishToken});
        // Compensate if local deletion/privacy changed while the HTTP finish was in flight.
        if(!await current()){if(same())await api.rpc('revoke_local',{localId:id});continue;}
        await store.patch(id,revision,{state:'synced',syncedAt:new Date(now()).toISOString(),error:'',errorStatus:0,errorCode:'',stage:'',nextAt:0});
      }catch(error){
        if(!same())return;
        const attempts=(q.attempts||0)+1;
        // Media capabilities expire after six hours. Restart only after expiry, not every retry.
        await store.patch(id,revision,{state:'pending',attempts,stage,error:error.message,errorStatus:error.status||0,errorCode:error.code||'',nextAt:now()+Math.min(300000,5000*2**Math.min(attempts,6))});
      }finally{changed();}
    }
  }
  return {get busy(){return !!running;},run(force=false){
    if(running)return running;
    running=drain(force).catch(error=>{changed(error.message);}).finally(()=>{running=null;});return running;
  }};
}
