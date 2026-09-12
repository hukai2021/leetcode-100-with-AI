
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {CoachService}=require('../electron/service.cjs');
const root=path.resolve(__dirname,'..');
async function service(t){
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'hot100-sql-service-'));
 const s=await CoachService.open({userData,dataRoot:path.join(root,'data'),runtimeRoot:path.join(root,'runtime'),codexExe:path.join(root,'runtime/codex/codex.exe')});
 t.after(()=>{s.close();fs.rmSync(userData,{recursive:true,force:true});});
 return s;
}
test('catalog keeps Hot100 IDs and adds exactly 50 SQL questions with separate drafts',async t=>{
 const s=await service(t);
 const b=await s.bootstrap();
 assert.equal(b.problems.filter(p=>p.collection==='hot100').length,100);
 assert.equal(b.problems.filter(p=>p.collection==='sql50').length,50);
 assert.equal(new Set(b.problems.map(p=>p.id)).size,150);
 assert.equal(b.runtime.sql.available,true);
 for(const p of b.problems.filter(p=>p.kind==='sql')){
  assert.match(p.id,/^sql-\d+$/);assert.ok(p.templates.sql);assert.ok(p.sql.tables.length);
  assert.ok(s.cases[p.id].length>=2,p.id+' missing fixtures');
 }
 await s.invoke('saveState',{id:'1',patch:{drafts:{python:'old python',cpp:'old cpp'},notes:'保留旧笔记',favorite:true,status:'done'}});
 await s.invoke('applySuggestion',{problemId:'sql-1757',language:'sql',code:'SELECT product_id FROM Products;'});
 await s.invoke('settings',{patch:{collection:'sql50',sqlLastProblemId:'sql-1757',algorithmLanguage:'cpp',arbitrary:'ignored'}});
 const after=await s.bootstrap();
 assert.equal(after.states['1'].drafts.python,'old python');
 assert.equal(after.states['1'].drafts.cpp,'old cpp');
 assert.equal(after.states['1'].notes,'保留旧笔记');
 assert.equal(after.states['1'].status,'done');
 assert.equal(after.states['sql-1757'].drafts.sql,'SELECT product_id FROM Products;');
 assert.equal(after.settings.collection,'sql50');assert.equal(after.settings.arbitrary,undefined);
 assert.throws(()=>s.validateInput({problemId:'1',language:'sql',code:'SELECT 1'}),/语言/);
 assert.throws(()=>s.validateInput({problemId:'sql-1757',language:'python',code:'print(1)'}),/语言/);
 await assert.rejects(s.invoke('format',{problemId:'sql-1757',language:'sql',code:'select 1'}),/暂不提供/);
 const backup=s.store.export();
 assert.ok(backup.records.state['sql-1757']);
 assert.equal(backup.records.thread,undefined);
});
test('SQL service routes actual SQLite execution and preserves query snapshots through review and follow-up',async t=>{
 const s=await service(t);const calls=[];
 s.client.start=async()=>{};
 s.client.request=async(method,params)=>{
  calls.push({method,params});
  if(method==='account/read')return {account:{type:'chatgpt'}};
  if(method==='model/list')return {data:[{id:'test',model:'test',isDefault:true}]};
  if(method==='thread/start')return {thread:{id:'sql-thread'}};
  if(method==='turn/start')return {turn:{id:'turn-'+calls.length}};
  throw Error('Unexpected fake method '+method);
 };
 s.client.close=()=>{};
 const code="SELECT product_id FROM Products WHERE low_fats = 'Y' AND recyclable = 'Y';";
 const wrong=await s.run({problemId:'sql-1757',language:'sql',code:'SELECT product_id FROM Products;'});
 assert.notEqual(wrong.status,'passed');
 const r=await s.review({problemId:'sql-1757',language:'sql',code});
 assert.equal(r.tests.status,'passed',JSON.stringify(r.tests));
 assert.ok(r.tests.cases[0].actual.columns.includes('product_id'));
 const payload=calls.filter(x=>x.method==='turn/start').at(-1).params.input[0].text;
 const context=JSON.parse(payload.split('以下 JSON 是本题上下文数据：\n')[1]);
 assert.equal(context.problem.sql.dialect,'sqlite');
 assert.equal(context.problem.sql.tables[0].name,'Products');
 assert.equal(context.tests.passed,context.tests.total);
 assert.equal(context.codeSnapshot,code);
 assert.ok(context.exampleCases.length);
 assert.match(payload,/SQLite\/MySQL/);
 const active=s.active.get('sql-1757');
 active.text='FAKE: 服务契约测试，不是真实 AI 验证。';
 s.finish(active,'completed');
 await s.invoke('applySuggestion',{problemId:'sql-1757',language:'sql',code:'SELECT 0;'});
 assert.equal(s.store.get('submission',r.submissionId).code,code);
 await s.chat({problemId:'sql-1757',language:'sql',code:'SELECT 0;',message:'为什么需要 AND？'});
 const follow=calls.filter(x=>x.method==='turn/start').at(-1);
 assert.equal(follow.params.threadId,'sql-thread');
 const ctx=JSON.parse(follow.params.input[0].text.split('以下 JSON 是本题上下文数据：\n')[1]);
 assert.equal(ctx.tests,null,'a changed draft must not inherit results from older SQL');
 assert.equal(calls.filter(x=>x.method==='thread/start').length,1);
 s.finish(s.active.get('sql-1757'),'completed');
 assert.equal(s.store.history('1').messages.length,0);
});


test('COUNT(*) in a scalar subquery reads the declared table without broadening database access',async t=>{
 const {SqlRunner}=require('../electron/sql-runner.cjs');
 const runner=new SqlRunner({runtimeRoot:root+'/runtime'});
 t.after(()=>runner.stop());
 const problem={kind:'sql',sql:{dialect:'sqlite',orderMatters:false,tables:[{name:'Users',columns:[{name:'id',type:'INTEGER'}]}]}};
 const result=await runner.run({problem,code:'SELECT (SELECT COUNT(*) FROM Users) AS total;',cases:[{input:[{Users:[[1],[2]]}],expected:{columns:['total'],rows:[[2]]}}]});
 assert.equal(result.status,'passed',JSON.stringify(result));
});
test('SQL cancellation does not create a submission or start a billed review',async t=>{
 const s=await service(t);let started=false;
 s.run=async()=>({status:'cancelled',passed:0,total:2,cases:[]});
 s.startAI=async()=>{started=true};
 await assert.rejects(s.review({problemId:'sql-1757',language:'sql',code:'SELECT product_id FROM Products;'}),/测试已停止/);
 assert.equal(started,false);assert.equal(s.store.history('sql-1757').submissions.length,0);
});
test('ORDER BY comparison accepts legal ties and rejects a true inversion',()=>{
 const {compareSql}=require('../electron/sql-runner.cjs');
 const expected={columns:['id','rating'],rows:[[1,9],[3,9],[5,8]]};
 const order=[{column:'rating',direction:'desc'}];
 assert.equal(compareSql(expected,{columns:expected.columns,rows:[[3,9],[1,9],[5,8]]},true,order),true);
 assert.equal(compareSql(expected,{columns:expected.columns,rows:[[5,8],[1,9],[3,9]]},true,order),false);
});
