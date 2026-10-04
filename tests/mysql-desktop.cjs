// Real Electron/IPC and bundled database engines, isolated learning profile.
// AI transport is deterministic; this test never sends a real AI request.
'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/test-evidence');
const profile=path.join(root,'.local','mysql-desktop-'+Date.now());
const reportPath=path.join(out,'mysql-desktop.json');
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode:'real-desktop-databases-mocked-ai',isolatedProfile:true,realAiRequested:false,checks:[]};
const references=require('../scripts/mysql-reference-solutions.json');
const oldSql="-- 保留旧 SQLite 草稿\nSELECT product_id FROM Products WHERE low_fats='Y' AND recyclable='Y';";
const oldCpp='// 保留旧 C++ 草稿\nclass Solution {};';
let app,page,popout;const pageErrors=[];
const write=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));};
const record=(name,detail)=>{report.checks.push({name,passed:true,detail});write();console.log('PASS',name);};
const call=(method,params,target=page)=>target.evaluate(([m,p])=>window.coach.invoke(m,p),[method,params]);
const waitEngine=(value)=>page.waitForFunction(value=>document.querySelector('[aria-label="SQL 引擎"]')?.value===value,value);
async function launch(){
 app=await _electron.launch({args:[root],env:{...process.env,COACH_USER_DATA:profile,COACH_TEST:'1'},timeout:60000});
 await app.evaluate(async()=>{
  const start=Date.now();while(!globalThis.coachTest){if(Date.now()-start>20000)throw Error('COACH_TEST unavailable');await new Promise(resolve=>setTimeout(resolve,25));}
  const service=globalThis.coachTest.service,client=service.client;
  client.close();client.start=async()=>{};
  const mock=globalThis.coachMySqlMock={calls:[],runs:[],turns:[],counter:0};
  const models=[{id:'sql-test-model',model:'sql-test-model',displayName:'SQL 测试模型',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'medium',description:'仅用于模拟协议检查'}],defaultReasoningEffort:'medium'}];
  client.listModels=async()=>structuredClone(models);
  client.account=async()=>({account:{type:'chatgpt'},models:structuredClone(models),modelsError:null,error:null,rateLimits:null,rateLimitsError:null,modelsUpdatedAt:new Date().toISOString()});
  client.request=async(method,params)=>{
   if(method==='account/read')return{account:{type:'chatgpt'}};
   if(method==='thread/start'||method==='thread/resume')return{thread:{id:params.threadId||'mysql-ui-thread-'+(++mock.counter)}};
   if(method==='turn/start'){
    const turnId='mysql-ui-turn-'+(++mock.counter);
    mock.turns.push({method,model:params.model,effort:params.effort,threadId:params.threadId,turnId,input:params.input});
    return{turn:{id:turnId}};
   }
   if(method==='turn/interrupt')return{};
   throw Error('Unexpected mock request '+method);
  };
  const invoke=service.invoke;
  service.invoke=function(method,params={}){if(['run','review','chat'].includes(method))mock.calls.push({method,...structuredClone(params)});const response=invoke.call(this,method,params);return method==='run'?Promise.resolve(response).then(result=>{mock.runs.push({params:structuredClone(params),result:structuredClone(result)});return result;}):response;};
  await service.account();service.event({type:'accountChanged',account:service.cachedAccount});
 });
 page=await app.firstWindow();page.on('pageerror',error=>pageErrors.push(error.message));
 await page.getByRole('button',{name:'SQL 50',exact:true}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.value==='sql-test-model');
 await page.context().setOffline(true);
}
async function selectSql(id){
 const boot=await call('bootstrap'),problem=boot.problems.find(p=>p.id===id);
 await page.getByRole('button',{name:'SQL 50',exact:true}).click();
 await page.getByLabel('搜索题目',{exact:true}).fill(problem.slug);
 await page.locator('.problem-item').filter({has:page.getByText((problem.displayId||problem.id)+'. '+problem.title,{exact:true})}).click();
 await page.getByRole('heading',{name:problem.title,exact:true}).waitFor();
 await page.getByLabel('搜索题目',{exact:true}).fill('');
}
async function execute(id,code,dialect='mysql'){
 await selectSql(id);await waitEngine(dialect);
 await call('applySuggestion',{problemId:id,language:'sql',code});
 await page.waitForFunction(code=>[...document.querySelectorAll('.view-lines')].some(el=>el.textContent.replace(/\s/g,'').includes(code.replace(/\s/g,'').slice(0,24))),code);
 const runCount=await app.evaluate(()=>globalThis.coachMySqlMock.runs.length);
 await page.getByRole('button',{name:'运行 SQL',exact:false}).click();
 await app.evaluate(async(_,count)=>{const start=Date.now();while(globalThis.coachMySqlMock.runs.length<=count){if(Date.now()-start>120000)throw Error('Desktop run result not received');await new Promise(resolve=>setTimeout(resolve,50));}},runCount);
 await page.locator('.result-summary').waitFor({timeout:120000});
 await page.getByRole('button',{name:'运行 SQL',exact:false}).waitFor({timeout:120000});
 const summary=await page.locator('.result-summary').textContent();
 assert.match(summary,/本地测试通过/);assert.match(summary,dialect==='mysql'?/MySQL/i:/SQLite/i);
 const recorded=await app.evaluate(()=>structuredClone(globalThis.coachMySqlMock.runs.at(-1)));
 assert.equal(recorded.params.problemId,id);assert.equal(recorded.params.code,code);assert.equal(recorded.params.sqlDialect,dialect);
 const result=recorded.result;assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.sqlDialect,dialect);
 assert.match(summary,new RegExp(result.total+'\\s*/\\s*'+result.total));
 return {passed:result.passed,total:result.total,runtime:result.runtime};
}
async function checkCompletion(letter,expected){
 await call('applySuggestion',{problemId:'sql-1757',language:'sql',code:'-- Completion display check\n'});
 await page.waitForFunction(()=>document.querySelector('.view-lines')?.textContent.includes('Completion'));
 await page.locator('.view-lines').click({position:{x:100,y:12}});await page.keyboard.press('Control+End');await page.keyboard.type(letter);
 const widget=page.locator('.suggest-widget.visible');await widget.locator('.monaco-list-row').first().waitFor({timeout:15000});
 const focused=widget.locator('.monaco-list-row.focused .monaco-highlighted-label').first();
 for(let i=0;i<80&&await focused.textContent()!==expected;i++)await page.keyboard.press('ArrowDown');
 assert.equal(await focused.textContent(),expected);
 const rows=await widget.locator('.monaco-list-row').evaluateAll(elements=>elements.map(row=>{
  const label=row.querySelector('.monaco-highlighted-label'),r=row.getBoundingClientRect(),b=label?.getBoundingClientRect();
  return{text:label?.textContent||'',row:{x:r.x,y:r.y,width:r.width,height:r.height},label:b&&{x:b.x,y:b.y,width:b.width,height:b.height}};
 }));
 for(const item of rows){assert.ok(item.text.trim());assert.ok(item.label?.width>0&&item.label?.height>0);assert.ok(item.label.y>=item.row.y-1&&item.label.y+item.label.height<=item.row.y+item.row.height+1,'completion label clipped: '+JSON.stringify(item));}
 await page.keyboard.press('Tab');await page.waitForFunction(expected=>document.querySelector('.view-lines .view-line:last-child')?.textContent.trim()===expected,expected);
 await page.waitForTimeout(600);return{typed:letter,accepted:expected,visibleLabels:rows.map(row=>row.text)};
}
async function capture(){
 const data=await app.evaluate(async({BrowserWindow},url)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);return(await w.capturePage()).toDataURL();},page.url());
 fs.writeFileSync(path.join(out,'mysql-desktop.png'),Buffer.from(data.split(',')[1],'base64'));
}
async function completeTurn(count){
 await app.evaluate(async(_,count)=>{const start=Date.now();while(globalThis.coachMySqlMock.turns.length<count){if(Date.now()-start>120000)throw Error('Mock turn not received');await new Promise(resolve=>setTimeout(resolve,50));}},count);
 await app.evaluate(()=>{
  const s=globalThis.coachTest.service,t=globalThis.coachMySqlMock.turns.at(-1);
  s.client.emit('notification',{method:'item/agentMessage/delta',params:{threadId:t.threadId,itemId:t.turnId,delta:'模拟 AI 响应：仅验证 SQL 方言、快照与聊天参数，未请求真实 AI。'}});
  s.client.emit('notification',{method:'turn/completed',params:{threadId:t.threadId,turn:{id:t.turnId,status:'completed'}}});
 });
 await page.waitForFunction(()=>!document.querySelector('[aria-label="选择 Codex 模型"]')?.disabled);
}
(async()=>{
 try{
  const {Store}=require('../electron/store.cjs');
  const legacy=await Store.open(path.join(profile,'learning'));
  legacy.put('settings','app',{lastProblemId:'49',language:'cpp'});
  legacy.saveState('49',{drafts:{cpp:oldCpp,python:'# 原 Python 草稿'},notes:'原算法笔记',favorite:true,status:'done'});
  legacy.saveState('sql-1757',{drafts:{sql:oldSql},notes:'旧 SQL 笔记',favorite:true,status:'doing'});
  await launch();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'cpp');
  const baseline=await call('bootstrap');assert.equal(baseline.runtime.sql.mysql.available,true);assert.equal(baseline.runtime.sql.sqlite.available,true);
  await selectSql('sql-1757');await waitEngine('mysql');
  assert.equal((await call('bootstrap')).states['sql-1757'].drafts.sql,oldSql);
  assert.match(await page.locator('.sql-compatibility-note').textContent(),/草稿.*保留.*不会自动转换/);
  assert.match(await page.locator('.chat-context').textContent(),/MySQL 8.4/);
  assert.match(await page.locator('.app-footer').textContent(),/MySQL/);
  record('旧档案默认选择 MySQL，SQL/C++ 草稿笔记收藏原样保留',{runtime:baseline.runtime.sql.mysql.version});

  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('sqlite');await waitEngine('sqlite');
  assert.equal((await call('bootstrap')).states['sql-1757'].drafts.sql,oldSql);
  record('SQLite 兼容选择真实执行并显示 SQLite 运行环境',await execute('sql-1757',oldSql,'sqlite'));
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('mysql');await waitEngine('mysql');
  assert.equal((await call('bootstrap')).states['sql-1757'].drafts.sql,oldSql);
  record('切回 MySQL 后原草稿仍保留；SQL 由 MySQL 执行',await execute('sql-1757',references['sql-1757']));

  const completions=[];
  for(const [letter,expected] of [['S','SELECT'],['D','DATE_FORMAT'],['p','product_id']])completions.push(await checkCompletion(letter,expected));
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('sqlite');await waitEngine('sqlite');
  completions.push(await checkCompletion('S','STRFTIME'));
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('mysql');await waitEngine('mysql');
  record('MySQL/SQLite 首字母补全显示关键词、方言函数和本题字段，键盘接受可用',completions);

  for(const [id,feature] of [['sql-197','DATEDIFF'],['sql-1193','DATE_FORMAT'],['sql-1517','REGEXP_LIKE'],['sql-1484','GROUP_CONCAT ORDER BY SEPARATOR']]){
   const details=await execute(id,references[id]);
   const rendered=await page.locator('.problem-content').textContent();
   assert.match(rendered,/MySQL/);assert.doesNotMatch(rendered,/本地使用 SQLite 3/);
   record('编辑器运行按钮真实执行 MySQL '+feature,{problemId:id,...details});
  }
  await page.getByRole('button',{name:'刷新模型',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.model-feedback')?.textContent.includes('已同步'));
  await capture();
  await selectSql('sql-197');
  assert.match(await page.locator('.sql-dialect-note').textContent(),/DATEDIFF/);
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('sqlite');await waitEngine('sqlite');
  assert.match(await page.locator('.sql-dialect-note').textContent(),/SQLite.*date|date.*MySQL/s);
  assert.match(await page.locator('.problem-content').textContent(),/本地使用 SQLite 3/);
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('mysql');await waitEngine('mysql');
  record('题面与方言提示随引擎切换，MySQL 不混入 SQLite 专属说明');

  const popoutPromise=app.waitForEvent('window');
  await call('popout',{problemId:'sql-197'});
  popout=await popoutPromise;popout.on('pageerror',error=>pageErrors.push(error.message));
  await popout.getByLabel('与 AI 教练继续对话',{exact:true}).waitFor();
  assert.match(await popout.locator('.chat-context').textContent(),/MySQL/);
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('sqlite');await waitEngine('sqlite');
  await popout.waitForFunction(()=>document.querySelector('.chat-context')?.textContent.includes('SQLite'));
  await page.getByLabel('SQL 引擎',{exact:true}).selectOption('mysql');await waitEngine('mysql');
  await popout.waitForFunction(()=>document.querySelector('.chat-context')?.textContent.includes('MySQL'));
  record('独立聊天窗口同步主窗口的 SQL 引擎选择');

  await call('applySuggestion',{problemId:'sql-197',language:'sql',code:references['sql-197']});
  await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).click();await completeTurn(1);
  let history=await call('history',{problemId:'sql-197'});assert.equal(history.submissions[0].sqlDialect,'mysql');assert.equal(history.submissions[0].tests.sqlDialect,'mysql');
  const calls=await app.evaluate(()=>structuredClone(globalThis.coachMySqlMock.calls));
  assert.equal(calls.findLast(call=>call.method==='review').sqlDialect,'mysql');
  const reviewPrompt=await app.evaluate(()=>JSON.stringify(globalThis.coachMySqlMock.turns[0].input));assert.match(reviewPrompt,/mysql/i);assert.match(reviewPrompt,/DATEDIFF/);
  await popout.getByLabel('与 AI 教练继续对话',{exact:true}).fill('请解释 MySQL 的 DATEDIFF。');
  await popout.getByRole('button',{name:'发送消息',exact:true}).click();await completeTurn(2);
  const chat=await app.evaluate(()=>structuredClone(globalThis.coachMySqlMock.calls.findLast(call=>call.method==='chat')));
  assert.equal(chat.sqlDialect,'mysql');
  const chatPrompt=await app.evaluate(()=>JSON.stringify(globalThis.coachMySqlMock.turns[1].input));assert.match(chatPrompt,/mysql/i);
  record('模拟 AI 传输验证提交快照和独立窗口追问携带真实 MySQL 方言',{realAiRequested:false,submissionDialect:history.submissions[0].sqlDialect,chatDialect:chat.sqlDialect});
  await popout.close();popout=null;

  await page.getByRole('button',{name:'热题 100',exact:true}).click();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'cpp');
  const preserved=await call('bootstrap');assert.deepEqual(preserved.states['49'],baseline.states['49']);
  record('返回 Hot100 后原 C++ 语言、草稿、笔记、收藏与完成状态不变');
  await selectSql('sql-197');await page.getByLabel('SQL 引擎',{exact:true}).selectOption('sqlite');await waitEngine('sqlite');
  await app.close();app=null;await launch();await waitEngine('sqlite');
  assert.equal((await call('bootstrap')).settings.sqlDialect,'sqlite');
  assert.equal((await call('bootstrap')).states['sql-197'].drafts.sql,references['sql-197']);
  record('重启恢复 SQL 引擎偏好并保留原 SQL 草稿');
  assert.deepEqual(pageErrors,[]);record('全过程无 renderer pageerror');
  report.passed=true;report.completedAt=new Date().toISOString();write();console.log('MYSQL_DESKTOP_PASSED');
 }catch(error){report.passed=false;report.error=error.stack;write();console.error(error);if(app&&page)await capture().catch(()=>{});process.exitCode=1;}
 finally{if(app)await app.close().catch(()=>{});}
})();
