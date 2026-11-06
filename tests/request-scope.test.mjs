import test from 'node:test';
import assert from 'node:assert/strict';
import {requestScope} from '../src/request-scope.mjs';
test('deadline still aborts without static AbortSignal helpers',async()=>{
 const scope=requestScope(5);
 try{await new Promise(resolve=>scope.signal.addEventListener('abort',resolve,{once:true}));assert.equal(scope.timedOut,true);assert.equal(scope.signal.aborted,true);}
 finally{scope.dispose();}
});
test('caller cancellation is distinct from timeout and completed requests release their timer',async()=>{
 const parent=new AbortController(),scope=requestScope(20,parent.signal);parent.abort();assert.equal(scope.signal.aborted,true);assert.equal(scope.timedOut,false);scope.dispose();
 const done=requestScope(5);done.dispose();await new Promise(resolve=>setTimeout(resolve,12));assert.equal(done.signal.aborted,false);
 const cancelled=requestScope(50,parent.signal);assert.equal(cancelled.signal.aborted,true);cancelled.dispose();
});
