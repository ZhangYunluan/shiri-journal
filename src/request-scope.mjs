// AbortSignal.timeout()/any() are absent on older Android WebViews.
// Keep deadlines and cancellation using the long-supported AbortController API.
export function requestScope(ms=20000,parent){
 if(typeof AbortController!=='function')throw Error('当前系统 WebView 过旧，无法安全执行网络请求。请通过官方渠道更新 Android System WebView；本机记录保留。');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort(parent?.reason);
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},ms);
 if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
 return {signal:controller.signal,get timedOut(){return timedOut;},dispose(){clearTimeout(timer);parent?.removeEventListener('abort',cancel);}};
}
