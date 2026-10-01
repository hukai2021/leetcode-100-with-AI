const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {CoachService}=require('../electron/service.cjs');
const root=path.resolve(__dirname,'..');
const modelA={id:'catalog-a',model:'model-a',isDefault:true,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low',description:'less'},{reasoningEffort:'high',description:'more'}]};
const modelB={id:'catalog-b',model:'model-b',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:'normal'},{reasoningEffort:'xhigh',description:'deep'}]};
const input={problemId:'1',language:'python',code:'class Solution:\n    pass',message:'检查边界条件'};
async function service(t){
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'hot100-model-service-'));
 const options={userData,dataRoot:path.join(root,'data'),runtimeRoot:path.join(root,'runtime'),codexExe:path.join(root,'runtime/codex/codex.exe')};
 const s=await CoachService.open(options);const calls=[];let thread=0,turn=0;
 s.client.start=async()=>{calls.push({method:'start'})};
 s.client.listModels=async()=>{calls.push({method:'listModels'});return [modelA,modelB]};
 s.client.account=async options=>{calls.push({method:'account',options});return {account:{type:'chatgpt'},models:[modelA,modelB],modelsUpdatedAt:'mock-server-time'}};
 s.client.close=()=>{};
 s.client.request=async(method,params)=>{
  calls.push({method,params});
  if(method==='account/read')return {account:{type:'chatgpt'}};
  if(method==='thread/start')return {thread:{id:'mock-thread-'+ ++thread}};
  if(method==='thread/resume')return {thread:{id:params.threadId}};
  if(method==='turn/start')return {turn:{id:'mock-turn-'+ ++turn}};
  throw new Error('Unexpected mocked request '+method);
 };
 t.after(()=>{s.close();s.store.db.close();fs.rmSync(userData,{recursive:true,force:true})});
 return {s,calls,options};
}
function finish(s,id='1'){const a=s.active.get(id);assert.ok(a);a.text='MOCK: 协议验证，不是真实 AI 回答。';s.finish(a,'completed')}
function turns(calls){return calls.filter(c=>c.method==='turn/start').map(c=>c.params)}

test('new, loaded, and resumed threads send the selected model and supported effort on every turn',async t=>{
 const {s,calls}=await service(t);
 const first=await s.chat({...input,model:'catalog-a',reasoningEffort:'low'});
 assert.equal(first.model,'model-a');assert.equal(first.reasoningEffort,'low');finish(s);
 const second=await s.chat({...input,model:'model-b',reasoningEffort:'xhigh'});
 assert.equal(second.threadId,first.threadId);assert.equal(second.reasoningEffort,'xhigh');finish(s);
 s.loaded.clear();
 const third=await s.chat({...input,model:'model-b'});
 assert.equal(third.threadId,first.threadId);assert.equal(third.reasoningEffort,'medium');finish(s);
 assert.deepEqual(turns(calls).map(p=>[p.model,p.effort]),[['model-a','low'],['model-b','xhigh'],['model-b','medium']]);
 assert.equal(calls.filter(c=>c.method==='thread/start').length,1);
 const resume=calls.filter(c=>c.method==='thread/resume');assert.equal(resume.length,1);assert.equal(resume[0].params.model,'model-b');
 assert.equal(calls.filter(c=>c.method==='listModels').length,3,'AI starts must resolve the current full model catalog');
 const messages=s.store.history('1').messages;
 assert.deepEqual(messages.filter(m=>m.role==='assistant').map(m=>[m.model,m.reasoningEffort]),[['model-a','low'],['model-b','xhigh'],['model-b','medium']]);
 assert.ok(messages.every(m=>m.codeSnapshot===input.code||m.role==='assistant'));
 assert.deepEqual(messages.filter(m=>m.role==='user').map(m=>m.reasoningEffort),['low','xhigh','medium']);
});

test('unsupported reasoning effort is rejected before a thread, message, or billed turn is started',async t=>{
 const {s,calls}=await service(t);
 await assert.rejects(s.chat({...input,model:'model-a',reasoningEffort:'xhigh'}),/当前模型不支持/);
 await assert.rejects(s.chat({...input,model:'model-b',reasoningEffort:'high'}),/当前模型不支持/);
 await assert.rejects(s.chat({...input,model:'model-a',reasoningEffort:1}),/当前模型不支持/);
 assert.equal(calls.filter(c=>c.method.startsWith('thread/')).length,0);
 assert.equal(turns(calls).length,0);assert.equal(s.store.history('1').messages.length,0);assert.equal(s.active.size,0);
});

test('missing effort metadata leaves the actual effort unknown and never fabricates support',async t=>{
 const {s,calls}=await service(t);
 s.client.listModels=async()=>[{id:'legacy',model:'legacy',isDefault:true}];
 const result=await s.chat({...input,model:'legacy'});assert.equal(result.reasoningEffort,null);
 assert.equal(Object.hasOwn(turns(calls)[0],'effort'),false);finish(s);
 const assistant=s.store.history('1').messages.find(m=>m.role==='assistant');assert.equal(assistant.reasoningEffort,null);
 await assert.rejects(s.chat({...input,model:'legacy',reasoningEffort:'medium'}),/当前模型不支持/);
 assert.equal(turns(calls).length,1);
});

test('a model removed from the current catalog cannot silently fall back to the cached model or another default',async t=>{
 const {s,calls}=await service(t);
 s.cachedAccount={account:{type:'chatgpt'},models:[modelA]};
 s.client.listModels=async()=>[modelB];
 await assert.rejects(s.chat({...input,model:'model-a'}),/刷新模型列表后重新选择/);
 assert.deepEqual(s.cachedAccount.models,[modelB]);assert.equal(turns(calls).length,0);assert.equal(s.active.size,0);
 s.client.listModels=async()=>[];
 await assert.rejects(s.chat(input),/刷新模型列表后重新选择/);assert.equal(turns(calls).length,0);
});

test('review and follow-up preserve the resolved model, effort, and submission code independently of later drafts',async t=>{
 const {s,calls}=await service(t);
 const code='class Solution:\n    def twoSum(self, nums, target): return [0,1]';
 s.run=async()=>({status:'passed',passed:1,total:1,cases:[{status:'passed'}]});
 const r=await s.review({...input,code,model:'catalog-a',reasoningEffort:'low'});
 assert.equal(r.model,'model-a');assert.equal(r.reasoningEffort,'low');finish(s);
 await s.invoke('applySuggestion',{problemId:'1',language:'python',code:'class Solution:\n    pass'});
 const submission=s.store.get('submission',r.submissionId);
 assert.equal(submission.code,code);assert.equal(submission.model,'model-a');assert.equal(submission.reasoningEffort,'low');assert.equal(submission.status,'completed');
 const assistant=s.store.history('1').messages.find(m=>m.role==='assistant');assert.equal(assistant.submissionId,r.submissionId);assert.equal(assistant.reasoningEffort,'low');
 await s.chat({...input,model:'model-b',reasoningEffort:'xhigh'});finish(s);
 assert.deepEqual(turns(calls).map(p=>[p.model,p.effort]),[['model-a','low'],['model-b','xhigh']]);
 assert.equal(s.store.get('submission',r.submissionId).reasoningEffort,'low');
});

test('a failed review keeps the resolved model and effort rather than reverting to requested catalog aliases',async t=>{
 const {s}=await service(t);const request=s.client.request;
 s.run=async()=>({status:'passed',passed:1,total:1,cases:[]});
 s.client.request=async(method,params)=>{if(method==='turn/start')throw new Error('MOCK upstream unavailable');return request(method,params)};
 await assert.rejects(s.review({...input,model:'catalog-a',reasoningEffort:'low'}),/MOCK upstream/);
 const sub=s.store.history('1').submissions[0];assert.equal(sub.status,'failed');assert.equal(sub.model,'model-a');assert.equal(sub.reasoningEffort,'low');
 const assistant=s.store.history('1').messages.find(m=>m.role==='assistant');assert.equal(assistant.status,'failed');assert.equal(assistant.reasoningEffort,'low');assert.equal(s.active.size,0);
});

test('model refresh blocks active AI and starting AI during refresh, then broadcasts the fresh account without retry loops',async t=>{
 const {s,calls}=await service(t);const events=[];s.on('event',event=>events.push(event));
 await s.chat({...input,model:'model-a'});
 await assert.rejects(s.invoke('refreshModels'),/AI 正在生成回答/);
 assert.equal(calls.filter(c=>c.method==='account').length,0);finish(s);
 const broadcastsBeforeRefresh=events.filter(e=>e.type==='accountChanged').length;
 let resolve;const fresh={account:{type:'chatgpt'},models:[modelB],modelsUpdatedAt:'mock-fresh-time'};
 s.client.account=async options=>{assert.deepEqual(options,{refreshModels:true});return new Promise(r=>{resolve=r})};
 const refresh=s.invoke('refreshModels');
 await assert.rejects(s.chat(input),/模型列表正在刷新/);
 const duplicate=s.invoke('refreshModels');
 resolve(fresh);assert.deepEqual(await refresh,fresh);assert.deepEqual(await duplicate,fresh);assert.equal(s.refreshingModels,null);
 const event=events.findLast(e=>e.type==='accountChanged');assert.deepEqual(event,{type:'accountChanged',account:fresh});
 assert.equal(turns(calls).length,1);assert.equal(events.filter(e=>e.type==='accountChanged').length,broadcastsBeforeRefresh+1,'one refresh broadcasts once, including duplicate callers');
});

test('ordinary account reads retain model errors and refresh failures leave the guard recoverable',async t=>{
 const {s,calls}=await service(t);const events=[];s.on('event',e=>events.push(e));
 const normal=await s.invoke('account');assert.equal(normal.models.length,2);assert.equal(calls.at(-1).options,undefined);assert.deepEqual(events.at(-1),{type:'accountChanged',account:normal});
 s.client.account=async()=>({account:null,rateLimits:null,models:[],modelsError:'MOCK catalog unavailable'});
 const failed=await s.invoke('refreshModels');assert.match(failed.modelsError,/MOCK catalog unavailable/);assert.equal(s.refreshingModels,null);
 assert.deepEqual(failed.models,normal.models);assert.equal(failed.modelsUpdatedAt,normal.modelsUpdatedAt);assert.equal(failed.account,null,'retain the current auth state while keeping only the last model catalog');
 assert.deepEqual(events.at(-1),{type:'accountChanged',account:failed});
 s.detectRuntime=async()=>({});assert.deepEqual((await s.bootstrap()).account,failed,'new windows bootstrap with the retained catalog and current error');
 s.client.account=async()=>{throw new Error('MOCK restart failed')};
 const failure=await s.invoke('refreshModels');assert.match(failure.error,/MOCK restart failed/);assert.equal(s.refreshingModels,null);
});

test('model and reasoning preferences persist across restart and only allowed settings are broadcast',async t=>{
 const {s,options}=await service(t);const events=[];s.on('event',event=>events.push(event));
 const settings=await s.invoke('settings',{patch:{model:'model-b',reasoningEffort:'xhigh',theme:'dark',accessToken:'never-store',arbitrary:'ignored'}});
 assert.equal(settings.model,'model-b');assert.equal(settings.reasoningEffort,'xhigh');assert.equal(settings.accessToken,undefined);assert.equal(settings.arbitrary,undefined);
 assert.deepEqual(events.at(-1),{type:'settingsChanged',settings});
 const reopened=await CoachService.open(options);t.after(()=>{reopened.close();reopened.store.db.close()});
 const stored=reopened.store.get('settings','app');assert.equal(stored.model,'model-b');assert.equal(stored.reasoningEffort,'xhigh');assert.equal(stored.accessToken,undefined);
});

test('ordinary account updates broadcast the new catalog to every window before settings may change',async t=>{
 const {s}=await service(t);const events=[];s.on('event',event=>events.push(event));
 await s.invoke('account');
 const current={account:{type:'chatgpt'},models:[modelB],modelsUpdatedAt:'mock-new-time'};
 s.client.account=async()=>current;
 assert.deepEqual(await s.invoke('account'),current);
 assert.deepEqual(events.filter(e=>e.type==='accountChanged').map(e=>e.account.models),[[modelA,modelB],[modelB]]);
 await s.invoke('settings',{patch:{model:'model-b',reasoningEffort:'xhigh'}});
 assert.equal(events.at(-2).type,'accountChanged');assert.equal(events.at(-1).type,'settingsChanged');
 assert.deepEqual(s.cachedAccount.models,[modelB]);
});

test('AI catalog changes broadcast a coherent account payload and unchanged catalogs do not create extra broadcasts',async t=>{
 const {s}=await service(t);const events=[];s.on('event',event=>events.push(event));
 s.cachedAccount={account:{type:'chatgpt'},models:[modelA],modelsUpdatedAt:'old-time',modelsError:'stale-error'};
 await s.chat({...input,model:'model-b',reasoningEffort:'xhigh'});finish(s);
 const fresh=events.filter(e=>e.type==='accountChanged');assert.equal(fresh.length,1);assert.deepEqual(fresh[0].account.models,[modelA,modelB]);assert.equal(fresh[0].account.modelsError,null);
 await s.chat({...input,model:'model-a',reasoningEffort:'low'});finish(s);
 assert.equal(events.filter(e=>e.type==='accountChanged').length,1);
});
