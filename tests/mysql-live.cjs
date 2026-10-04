// Real MySQL engine + official Codex App Server + existing ChatGPT account.
// Learning records use an isolated profile; credentials stay in the original keyring.
'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const profile=path.join(root,'.local','mysql-live-'+Date.now());
const evidence=path.join(root,'docs','test-evidence','mysql-live.json');
const problemId='sql-197',model='gpt-6.1-sol';
const wrong='SELECT w.id FROM Weather w JOIN Weather p ON julianday(w.recordDate)-julianday(p.recordDate)=1 WHERE w.temperature>p.temperature;';
const correct=require('../scripts/mysql-reference-solutions.json')[problemId];
const notes='MySQL 上使用 DATEDIFF(w.recordDate,p.recordDate)=1 比较相邻日期；julianday 属于 SQLite。先检查真实本地结果，再提交力扣。';
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode:'real-mysql-and-real-chatgpt',realAI:true,learningProfileIsolated:true,credentialsCopied:false,problemId,checks:[]};
const protocolCalls=[];let app,page,threadBeforeRestart;
const save=()=>{fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(report,null,2));};
const record=(name,details={})=>{report.checks.push({name,passed:true,...details});save();console.log('PASS',name);};
const call=(method,params)=>page.evaluate(([m,p])=>window.coach.invoke(m,p),[method,params]);
async function complete(previousCount){
 const deadline=Date.now()+300000;
 while(Date.now()<deadline){
  const h=await call('history',{problemId}),last=h.messages.filter(m=>m.role==='assistant').at(-1);
  if(h.messages.length>previousCount&&last&&!['pending','inProgress','streaming'].includes(last.status)){
   assert.equal(last.status,'completed','真实 AI 回答未完成');return h;
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error('真实 AI 回复等待超过 5 分钟');
}
async function launch(){
 app=await _electron.launch({args:[root],env:{...process.env,COACH_USER_DATA:profile,COACH_TEST:'1'},timeout:60000});
 page=await app.firstWindow();
 await page.getByRole('button',{name:'SQL 50',exact:true}).waitFor({timeout:60000});
 const auth=await app.evaluate(async(_,home)=>{
  const s=globalThis.coachTest.service;await s.account();s.client.close();s.client.home=home;
  s.mysqlLiveCalls=[];const original=s.client.request.bind(s.client);
  s.client.request=(method,p,timeout)=>{
   if(['turn/start','thread/resume'].includes(method))s.mysqlLiveCalls.push({method,model:p.model,effort:p.effort,threadId:p.threadId});
   return original(method,p,timeout);
  };
  const a=await s.account();s.event({type:'accountChanged',account:a});
  return {type:a.account?.type,models:a.models.map(m=>m.model||m.id)};
 },path.join(process.env.APPDATA,'Hot100 AI Coach','codex'));
 assert.equal(auth.type,'chatgpt','需在应用内登录 ChatGPT 后重新运行真实测试');
 assert.ok(auth.models.includes(model),'真实账户模型目录没有 GPT-6.1-Sol');
 return auth;
}
async function selectProblem(){
 await page.getByRole('button',{name:'SQL 50',exact:true}).click();
 const boot=await call('bootstrap'),problem=boot.problems.find(p=>p.id===problemId);
 await page.getByLabel('搜索题目',{exact:true}).fill(problem.slug);
 await page.locator('.problem-item').filter({has:page.getByText((problem.displayId||problem.id)+'. '+problem.title,{exact:true})}).click();
 await page.getByRole('heading',{name:problem.title,exact:true}).waitFor();
 await page.getByLabel('搜索题目',{exact:true}).fill('');
 await page.waitForFunction(()=>document.querySelector('[aria-label="SQL 引擎"]')?.value==='mysql');
}
async function runCorrect(){
 await page.getByRole('button',{name:'运行 SQL',exact:false}).click();
 await page.waitForFunction(()=>document.querySelector('.result-summary')?.textContent.includes('2 / 2'),{},{timeout:120000});
 const result=await app.evaluate((_,id)=>globalThis.coachTest.service.lastTests.get(id),problemId);
 assert.equal(result.status,'passed');assert.equal(result.passed,2);assert.equal(result.total,2);assert.equal(result.sqlDialect,'mysql');
 assert.match(result.runtime,/MySQL 8\.4/);assert.equal(result.code,correct);return result;
}
async function collectProtocol(){
 const calls=await app.evaluate(()=>globalThis.coachTest.service.mysqlLiveCalls);
 protocolCalls.push(...calls.map(c=>({method:c.method,model:c.model,effort:c.effort,sameSavedThread:threadBeforeRestart?c.threadId===threadBeforeRestart:undefined})));
 return calls;
}
(async()=>{
 try{
  const auth=await launch();report.accountProbe={type:auth.type,modelCount:auth.models.length,selectedModelAvailable:true};
  await selectProblem();
  const boot=await call('bootstrap');assert.equal(boot.runtime.sql.mysql.available,true);assert.match(boot.runtime.sql.mysql.version,/MySQL 8\.4/);
  record('真实 ChatGPT 账户与随包 MySQL 引擎可用',{accountType:auth.type,modelCount:auth.models.length,runtime:boot.runtime.sql.mysql.version});
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption(model);
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('high');
  await call('applySuggestion',{problemId,language:'sql',sqlDialect:'mysql',code:wrong});
  await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).click();
  let history=await complete(0),submission=history.submissions[0];
  assert.equal(submission.model,model);assert.equal(submission.reasoningEffort,'high');assert.equal(submission.sqlDialect,'mysql');
  assert.equal(submission.status,'completed');assert.equal(submission.tests.sqlDialect,'mysql');assert.equal(submission.tests.status,'failed');
  assert.equal(submission.tests.passed,0);assert.equal(submission.tests.total,2);assert.equal(submission.code,wrong);
  assert.match(JSON.stringify(submission.tests.cases),/julianday|FUNCTION/i);
  assert.match(submission.review,/julianday/i);assert.match(submission.review,/DATEDIFF/i);assert.match(submission.review,/MySQL/i);assert.match(submission.review,/[\u4e00-\u9fff]/);
  record('错误 SQLite 日期函数在真实 MySQL 上失败并获中文真实批改',{model,reasoningEffort:'high',sqlDialect:submission.sqlDialect,localPassed:0,total:2,status:submission.status,reviewLength:submission.review.length,reviewMentions:['julianday','DATEDIFF','MySQL']});
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('medium');
  await page.getByLabel('与 AI 教练继续对话',{exact:true}).fill('继续刚才的批改，请只用两句话解释为什么 MySQL 中 DATEDIFF(w.recordDate,p.recordDate)=1 能对应题目的昨天，尤其说明参数顺序。');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  history=await complete(history.messages.length);let answer=history.messages.filter(m=>m.role==='assistant').at(-1);
  assert.equal(answer.model,model);assert.equal(answer.reasoningEffort,'medium');assert.equal(answer.sqlDialect,'mysql');assert.match(answer.text,/DATEDIFF/i);assert.match(answer.text,/[\u4e00-\u9fff]/);
  record('软件右侧真实连续追问使用 MySQL 方言与中等思考强度',{model,reasoningEffort:'medium',sqlDialect:answer.sqlDialect,status:answer.status,responseLength:answer.text.length});
  await call('applySuggestion',{problemId,language:'sql',sqlDialect:'mysql',code:correct});
  const passed=await runCorrect();
  await page.getByRole('button',{name:'笔记',exact:true}).click();await page.getByLabel('本题笔记',{exact:true}).fill(notes);
  await page.getByLabel('本题完成状态',{exact:true}).selectOption('done');
  await page.waitForFunction(()=>document.querySelector('.code-status')?.textContent.includes('已保存到本机'));
  const saved=await call('bootstrap');assert.equal(saved.states[problemId].drafts.sql,correct);assert.equal(saved.states[problemId].notes,notes);assert.equal(saved.states[problemId].status,'done');
  record('修正为 DATEDIFF 后真实 MySQL 2/2，笔记与完成状态保存',{localPassed:passed.passed,total:passed.total,runtime:passed.runtime,sqlDialect:passed.sqlDialect,state:'done',notesSaved:true});
  const before=await call('history',{problemId});threadBeforeRestart=await app.evaluate((_,id)=>globalThis.coachTest.service.store.get('thread',id)?.id,problemId);assert.ok(threadBeforeRestart);
  const firstCalls=await collectProtocol();assert.deepEqual(firstCalls.filter(c=>c.method==='turn/start').map(c=>[c.model,c.effort]),[[model,'high'],[model,'medium']]);
  await app.close();app=null;
  await launch();
  await page.waitForFunction(()=>document.querySelector('[aria-label="SQL 引擎"]')?.value==='mysql');
  const restored=await call('bootstrap');assert.equal(restored.settings.model,model);assert.equal(restored.settings.reasoningEffort,'medium');
  assert.equal(restored.states[problemId].drafts.sql,correct);assert.equal(restored.states[problemId].notes,notes);assert.equal(restored.states[problemId].status,'done');
  const restoredHistory=await call('history',{problemId});assert.deepEqual(restoredHistory,before);
  assert.equal(restoredHistory.submissions[0].tests.passed,0);assert.equal(restoredHistory.submissions[0].tests.sqlDialect,'mysql');
  assert.ok(restoredHistory.versions.some(v=>v.code===wrong));
  record('重启恢复 MySQL 选择、正解草稿、笔记、完成状态、原批改快照测试与对话',{sqlDialect:'mysql',state:'done',model,reasoningEffort:'medium',submissions:restoredHistory.submissions.length,messages:restoredHistory.messages.length,originalSubmissionPassed:0,originalSubmissionTotal:2,recoverableWrongDraft:true,currentRunResultPersisted:false});
  const rerun=await runCorrect();record('重启后正解再运行仍为真实 MySQL 2/2',{localPassed:rerun.passed,total:rerun.total,runtime:rerun.runtime,sqlDialect:rerun.sqlDialect});
  await page.getByLabel('与 AI 教练继续对话',{exact:true}).fill('我已改成 DATEDIFF，刚才真实 MySQL 本地 2/2 通过。请继续同一题，结合当前正解草稿只提醒我一个跨月日期需要注意的点，两句话即可。');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  const resumed=await complete(restoredHistory.messages.length);answer=resumed.messages.filter(m=>m.role==='assistant').at(-1);
  assert.equal(answer.model,model);assert.equal(answer.reasoningEffort,'medium');assert.equal(answer.sqlDialect,'mysql');assert.match(answer.text,/[\u4e00-\u9fff]/);
  const lastCalls=await collectProtocol();assert.ok(lastCalls.some(c=>c.method==='thread/resume'&&c.threadId===threadBeforeRestart));
  assert.deepEqual(lastCalls.filter(c=>c.method==='turn/start').map(c=>[c.model,c.effort]),[[model,'medium']]);
  report.protocolCalls=protocolCalls;
  record('关闭并重开软件后真实恢复同一官方线程继续追问',{threadResume:true,sameThread:true,model,reasoningEffort:'medium',sqlDialect:answer.sqlDialect,status:answer.status,responseLength:answer.text.length});
  report.actualAITurns=protocolCalls.filter(c=>c.method==='turn/start').length;assert.equal(report.actualAITurns,3);
  report.passed=true;report.completedAt=new Date().toISOString();save();console.log('MYSQL_LIVE_PASSED');
 }catch(error){report.passed=false;report.error=error.message;save();console.error(error.message);process.exitCode=1;}
 finally{if(app)await app.close().catch(()=>{});}
})();
