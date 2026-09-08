const {_electron}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const out=path.resolve('docs/test-evidence');fs.mkdirSync(out,{recursive:true});
const report=fs.existsSync(path.join(out,'desktop-flow.json'))?JSON.parse(fs.readFileSync(path.join(out,'desktop-flow.json'),'utf8')):{startedAt:new Date().toISOString(),environment:'Windows Electron desktop, official Codex App Server stdio',checks:[]};
if(report.failure){(report.previousFailures??=[]).push(report.failure);delete report.failure;}report.resumedAt=new Date().toISOString();
const check=(name,details)=>{report.checks.push({name,status:'passed',details,time:new Date().toISOString()});fs.writeFileSync(path.join(out,'desktop-flow.json'),JSON.stringify(report,null,2));console.log('PASS',name)};
let application,page;
const invoke=(method,params)=>page.evaluate(({method,params})=>window.coach.invoke(method,params),{method,params});
async function launch(){application=await _electron.launch({args:[path.resolve('.')],env:{...process.env,COACH_TEST:'1'},timeout:30000});page=await application.firstWindow();page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).waitFor({timeout:40000});}
async function complete(afterCount=0){const start=Date.now();while(Date.now()-start<300000){const h=await invoke('history',{problemId:'1'});const last=h.messages.filter(m=>m.role==='assistant').at(-1);if(h.messages.length>afterCount&&last&&last.status!=='inProgress'&&last.status!=='streaming')return h;const banner=await page.locator('.error-banner').textContent().catch(()=>'');if(banner)throw new Error(banner);await new Promise(r=>setTimeout(r,1200));}throw new Error('等待真实 AI 回复超时')}
(async()=>{try{
 await launch();check('独立 Windows 窗口已加载题面、Monaco、聊天');
 const account=await invoke('account');assert.equal(account.account?.type,'chatgpt');check('官方账户认证可用',{type:account.account.type,plan:account.account.planType,modelIds:account.models.map(m=>m.id),hasRateLimits:!!account.rateLimits});
 await invoke('cancelLogin').catch(()=>{});
 const wrong='class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        # 验证案例：错误地复用同一个下标\n        return [0, 0]\n';
 await invoke('saveState',{id:'1',patch:{drafts:{python:wrong},notes:'桌面端到端验证：先错误提交，再修正并保存。',status:'doing'}});await invoke('settings',{patch:{lastProblemId:'1',language:'python'}});await page.reload();await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).waitFor();
 let reviewHistory=await invoke('history',{problemId:'1'});let sub=reviewHistory.submissions.find(s=>s.status==='completed'&&s.code===wrong);
 if(!sub){const count=reviewHistory.messages.length;await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).click();reviewHistory=await complete(count);sub=reviewHistory.submissions[0];}
 assert.equal(sub.status,'completed',sub.error);assert.ok(sub.review.length>100);assert.equal(sub.tests.passed,0);assert.equal(sub.code,wrong);check('真实错误代码批改',{submissionId:sub.id,model:sub.model,localPassed:sub.tests.passed,total:sub.tests.total,reply:sub.review,threadId:sub.threadId,turnId:sub.turnId});
 await page.screenshot({path:path.join(out,'01-real-review.png')});
 const follow='请接着刚才这次批改，解释为什么不能复用同一个下标，并逐步分析 nums=[3,3]、target=6。暂时不要给完整代码。';
 await page.getByLabel('与 AI 教练继续对话').fill(follow);await page.getByRole('button',{name:'发送消息'}).click();
 const chatHistory=await complete(reviewHistory.messages.length);const reply=chatHistory.messages.filter(m=>m.role==='assistant').at(-1);assert.equal(reply.status,'completed',reply.error);assert.ok(reply.text.length>40);check('右侧聊天窗口真实连续追问',{question:follow,reply:reply.text});await page.screenshot({path:path.join(out,'02-followup.png')});
 const good='class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, value in enumerate(nums):\n            if target - value in seen:\n                return [seen[target - value], i]\n            seen[value] = i\n        return []\n';
 await invoke('applySuggestion',{problemId:'1',language:'python',code:good});const result=await invoke('run',{problemId:'1',language:'python',code:good});assert.equal(result.status,'passed',result.error);check('修正代码真实本地测试通过',{passed:result.passed,total:result.total});await invoke('saveState',{id:'1',patch:{status:'done',favorite:true,review:true}});
 await application.close();await launch();const restored=await invoke('bootstrap');const restoredHistory=await invoke('history',{problemId:'1'});assert.equal(restored.states['1'].drafts.python,good);assert.equal(restored.states['1'].status,'done');assert.equal(restoredHistory.submissions[0].review,sub.review);assert.ok(restoredHistory.messages.some(m=>m.text===reply.text));check('关闭并重启恢复草稿、笔记、进度、批改和对话');
 await page.getByLabel('与 AI 教练继续对话').fill('重启后继续：请用一句话总结刚才重复下标的错误。');await page.getByRole('button',{name:'发送消息'}).click();const resumed=await complete(restoredHistory.messages.length);const final=resumed.messages.filter(m=>m.role==='assistant').at(-1);assert.equal(final.status,'completed',final.error);check('重启后官方 thread/resume 连续对话',{reply:final.text});
 await page.screenshot({path:path.join(out,'03-restart-restored.png')});report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'desktop-flow.json'),JSON.stringify(report,null,2));console.log('ALL_FLOW_PASSED');
 }catch(e){report.failure=e.stack;fs.writeFileSync(path.join(out,'desktop-flow.json'),JSON.stringify(report,null,2));console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}finally{if(application)await application.close().catch(()=>{});}})();
