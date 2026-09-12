'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const live=process.argv.includes('--live');
const exe=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'));
if(live&&exe)throw Error('Live test uses the development test bridge with an isolated learning profile.');
const mode=exe?'installed':live?'live':'desktop';
const profile=path.join(root,'.local','sql-'+mode+'-'+Date.now());
const out=path.join(root,'docs/test-evidence');
fs.mkdirSync(out,{recursive:true});
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode,checks:[]};
let app,page;const pageErrors=[];
const wrong="SELECT product_id FROM Products WHERE low_fats = 'Y' OR recyclable = 'Y';";
const good="SELECT product_id FROM Products WHERE low_fats = 'Y' AND recyclable = 'Y';";
const record=(name,detail)=>{report.checks.push({name,passed:true,detail});fs.writeFileSync(path.join(out,'sql-'+mode+'.json'),JSON.stringify(report,null,2));console.log('PASS',name);};
const call=(method,params)=>page.evaluate(([method,params])=>window.coach.invoke(method,params),[method,params]);
async function launch(){
 const options={args:exe?[]:[root],env:{...process.env,COACH_USER_DATA:profile,COACH_TEST:'1'},timeout:45000};
 if(exe)options.executablePath=exe;
 app=await _electron.launch(options);page=await app.firstWindow();
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).waitFor({timeout:45000});
 assert.equal(await app.evaluate(({app})=>app.getVersion()),report.version);
}
async function selectSql(){
 await page.getByRole('button',{name:'SQL 50',exact:true}).click();
 await page.getByRole('heading',{name:'可回收且低脂的产品',exact:true}).waitFor();
}
async function execute(code){
 await call('applySuggestion',{problemId:'sql-1757',language:'sql',code});
 await page.getByRole('button',{name:'运行 SQL',exact:false}).click();
 await page.locator('.result-summary').waitFor();
 await page.getByRole('button',{name:'运行 SQL',exact:false}).waitFor();
 return await page.locator('.result-summary').textContent();
}
async function capture(name){
 const data=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());return (await w.capturePage()).toDataURL();});
 fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));
}
async function complete(count){
 const start=Date.now();
 while(Date.now()-start<300000){
  const h=await call('history',{problemId:'sql-1757'});
  const last=h.messages.filter(m=>m.role==='assistant').at(-1);
  if(h.messages.length>count&&last&&!['pending','inProgress','streaming'].includes(last.status)){
   assert.equal(last.status,'completed',last.error||last.text);
   return h;
  }
  await new Promise(r=>setTimeout(r,1200));
 }
 throw Error('SQL 真实 AI 回复等待超过5分钟');
}
(async()=>{
 try{
  const {Store}=require('../electron/store.cjs');
  const legacy=await Store.open(path.join(profile,'learning'));
  legacy.put('settings','app',{lastProblemId:'49',language:'cpp'});
  legacy.saveState('49',{drafts:{cpp:'// legacy cpp draft',python:'# legacy python draft'},notes:'旧版档案'});
  await launch();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'cpp');
  await page.getByRole('button',{name:'SQL 50',exact:true}).click();
  await page.getByRole('button',{name:'热题 100',exact:true}).click();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'cpp');
  assert.equal((await call('bootstrap')).settings.lastProblemId,'49');
  assert.equal((await call('bootstrap')).states['49'].drafts.cpp,'// legacy cpp draft');
  record('旧版仅保存 language=cpp 的档案：首次跨库后题目/语言/草稿保持');
  await page.getByLabel('搜索题目',{exact:true}).fill('two-sum');
  await page.locator('.problem-item').filter({has:page.getByText('1. 两数之和',{exact:true})}).click();
  await page.getByLabel('搜索题目',{exact:true}).fill('');
  const b=await call('bootstrap');
  assert.equal(b.problems.filter(p=>p.collection==='hot100').length,100);
  assert.equal(b.problems.filter(p=>p.collection==='sql50').length,50);
  assert.equal(b.runtime.sql.available,true);
  if(exe)assert.ok(b.runtime.sql.path.includes('resources'),'installed SQLite must use bundled Python');
  record('独立桌面加载 Hot100 + SQL50 与随包 SQLite',{version:b.runtime.sql.version,hot100:100,sql50:50});
  await page.context().setOffline(true);
  await call('applySuggestion',{problemId:'1',language:'cpp',code:'// 保留原 C++ 草稿\nclass Solution {};'});
  await call('saveState',{id:'1',patch:{notes:'算法笔记应保留',favorite:true,status:'doing'}});
  await page.getByLabel('编程语言',{exact:true}).selectOption('cpp');
  await selectSql();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'sql');
  assert.match(await page.locator('.problem-content').textContent(),/Products|product_id/);
  assert.match(await execute(wrong),/本地测试通过/);
  const wrongResult=await call('run',{problemId:'sql-1757',language:'sql',code:wrong});
  assert.equal(wrongResult.status,'failed');
  const goodSummary=await execute(good);
  const n=b.cases['sql-1757'].length;
  assert.match(goodSummary,new RegExp(n+'\\s*/\\s*'+n));
  if(await page.locator('.case').first().getAttribute('open')===null)await page.locator('.case summary').first().click();
  assert.ok(await page.locator('.results table').count()>=2,'expected and actual SQL tables');
  record('断开渲染器网络后，按钮执行错误/正确 SQL 并展示结果表格',{wrongPassed:wrongResult.passed,total:n});
  const visited=[];
  for(const p of b.problems.filter(p=>p.collection==='sql50')){
   await page.getByLabel('搜索题目',{exact:true}).fill(p.slug);
   await page.locator('.problem-item').filter({has:page.getByText((p.displayId||p.id)+'. '+p.title,{exact:true})}).click();
   await page.getByRole('heading',{name:p.title,exact:true}).waitFor();
   assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'sql');
   const text=await page.locator('.problem-content').textContent();
   assert.match(text,/示例/);assert.match(text,/[\u4e00-\u9fff]/);assert.ok(text.length>120);
   visited.push(p.id);
  }
  record('实际逐题打开全部 50 道 SQL 中文题面',{count:visited.length,ids:visited});
  await page.getByLabel('搜索题目',{exact:true}).fill('');
  await page.getByRole('button',{name:'热题 100',exact:true}).click();
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'cpp');
  const restored=await call('bootstrap');
  assert.equal(restored.states['1'].drafts.cpp,'// 保留原 C++ 草稿\nclass Solution {};');
  assert.equal(restored.states['1'].notes,'算法笔记应保留');
  await page.getByRole('button',{name:'SQL 50',exact:true}).click();
  await page.getByLabel('搜索题目',{exact:true}).fill('recyclable-and-low-fat-products');
  await page.locator('.problem-item').filter({has:page.getByText('1757. 可回收且低脂的产品',{exact:true})}).click();
  await page.getByLabel('搜索题目',{exact:true}).fill('');
  await page.getByTitle('下一题',{exact:true}).click();
  assert.match((await call('bootstrap')).settings.lastProblemId,/^sql-/);
  await page.getByTitle('上一题',{exact:true}).click();
  assert.equal((await call('bootstrap')).settings.lastProblemId,'sql-1757');
  record('切库恢复原算法语言/草稿/笔记，SQL 上下题导航限定本题库');
  const deletion=b.problems.find(p=>p.id==='sql-196');
  const deleted=await call('run',{problemId:deletion.id,language:'sql',code:'DELETE FROM Person WHERE id NOT IN (SELECT MIN(id) FROM Person GROUP BY email);'});
  assert.equal(deleted.status,'passed',JSON.stringify(deleted));
  record('第196题真实 DELETE 执行并校验剩余数据',{passed:deleted.passed,total:deleted.total});
  const cppCode='class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { for(int i=0;i<(int)nums.size();i++)for(int j=i+1;j<(int)nums.size();j++)if(nums[i]+nums[j]==target)return {i,j};return {}; } };';
  const cpp=await call('run',{problemId:'1',language:'cpp',code:cppCode});
  assert.equal(cpp.status,'passed',cpp.error);
  record('增加 SQL 后，原 C++17 本地编译执行仍通过',{passed:cpp.passed,total:cpp.total});
  await execute(good);
  await capture('sql-'+mode+'.png');
  await call('saveState',{id:'sql-1757',patch:{notes:'SQL 测试笔记：AND 同时满足两个条件',favorite:true,review:true,status:'done'}});
  if(live){
   await page.context().setOffline(false);
   const auth=await app.evaluate(async(_,authHome)=>{
    const s=globalThis.coachTest.service;
    await s.account();s.client.close();
    await new Promise(r=>setTimeout(r,750));
    s.client.home=authHome;
    s.client.ready=null;
    const a=await s.account();
    s.event({type:'accountChanged'});
    return {type:a.account?.type,modelCount:a.models?.length};
   },path.join(process.env.APPDATA,'Hot100 AI Coach','codex'));
   assert.equal(auth.type,'chatgpt');
   record('官方 App Server 复用现有 ChatGPT 认证；学习数据使用独立测试档案',auth);
   await call('applySuggestion',{problemId:'sql-1757',language:'sql',code:wrong});
   const before=await call('history',{problemId:'sql-1757'});
   await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).click();
   const h=await complete(before.messages.length);const sub=h.submissions[0];
   assert.equal(sub.status,'completed',sub.error);assert.equal(sub.code,wrong);assert.ok(sub.review.length>50);assert.ok(sub.tests.passed<sub.tests.total);
   record('一次真实 SQL 错解批改完成',{model:sub.model,localPassed:sub.tests.passed,total:sub.tests.total,review:sub.review});
   const question='接着这次批改，请用测试表里的一行说明 OR 和 AND 的区别。只解释原因，不要给完整答案。';
   await page.getByLabel('与 AI 教练继续对话').fill(question);
   await page.getByRole('button',{name:'发送消息'}).click();
   const follow=await complete(h.messages.length);const reply=follow.messages.filter(m=>m.role==='assistant').at(-1);
   assert.ok(reply.text.length>30);
   record('右侧聊天窗口真实连续追问',{question,reply:reply.text});
   await execute(good);
   assert.equal((await call('history',{problemId:'sql-1757'})).submissions[0].code,wrong);
   record('修正 SQL 后本地通过，旧提交保持原错误代码快照');
   await capture('sql-live-review-private.png');
  }
  await app.close();app=null;await launch();
  const saved=await call('bootstrap');
  assert.equal(saved.states['sql-1757'].drafts.sql,good);
  assert.equal(saved.states['sql-1757'].status,'done');
  assert.equal(saved.states['sql-1757'].favorite,true);
  assert.equal(saved.states['1'].notes,'算法笔记应保留');
  assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'sql');
  if(live)assert.ok((await call('history',{problemId:'sql-1757'})).messages.length>=4);
  record('重启恢复 SQL 草稿、笔记、收藏、完成状态与本题历史');
  assert.deepEqual(pageErrors,[]);
  record('全过程无 renderer pageerror');
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'sql-'+mode+'.json'),JSON.stringify(report,null,2));
  console.log('SQL_DESKTOP_PASSED',mode);
 }catch(e){
  report.failure=e.stack;fs.writeFileSync(path.join(out,'sql-'+mode+'.json'),JSON.stringify(report,null,2));
  console.error(e);process.exitCode=1;
  if(app)await capture('sql-'+mode+'-failure.png').catch(()=>{});
 }finally{if(app)await app.close().catch(()=>{});}
})();
