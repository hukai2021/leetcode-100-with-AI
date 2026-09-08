const {_electron}=require('playwright');const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const result={testedAt:new Date().toISOString(),checks:[]};let app,page;
const save=(name,detail)=>{result.checks.push({name,passed:true,detail});fs.writeFileSync('docs/test-evidence/desktop-ai-controls.json',JSON.stringify(result,null,2));console.log('PASS',name)};
const call=(m,p)=>page.evaluate(([m,p])=>window.coach.invoke(m,p),[m,p]);
(async()=>{try{
 app=await _electron.launch({args:[path.resolve('.')],env:{...process.env,COACH_TEST:'1'}});page=await app.firstWindow();await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).waitFor({timeout:30000});
 const b=await call('bootstrap');const code=b.states['1'].drafts.python;const account=await call('account');assert.equal(account.account.type,'chatgpt');const model=account.models.find(m=>m.isDefault).model;
 const review=await call('review',{problemId:'1',language:'python',code,model});let sub;
 for(let i=0;i<150;i++){sub=(await call('history',{problemId:'1'})).submissions.find(s=>s.id===review.submissionId);if(sub.status!=='inProgress'&&sub.status!=='pending')break;await new Promise(r=>setTimeout(r,1000))}assert.equal(sub.status,'completed',sub.error);assert.equal(sub.tests.passed,sub.tests.total);assert.ok(sub.review.length>100);save('正确代码真实AI批改完成',{model,tests:{passed:sub.tests.passed,total:sub.tests.total},reply:sub.review});
 const started=await call('chat',{problemId:'1',language:'python',code,model,message:'请给出本题完整题解，详细比较暴力枚举、排序双指针和哈希表方案，并分别分析复杂度。'});const activeBootstrap=await call('bootstrap');assert.equal(activeBootstrap.active['1'],true);save('生成过程中bootstrap可序列化，弹出窗口不会因活动任务失败');
 await call('stopAI',{problemId:'1'});let last;for(let i=0;i<30;i++){last=(await call('history',{problemId:'1'})).messages.filter(m=>m.role==='assistant').at(-1);if(last.status!=='inProgress')break;await new Promise(r=>setTimeout(r,300))}assert.equal(last.status,'interrupted',last.error);save('真实 turn/interrupt 停止生成',{turnId:started.turnId,status:last.status});
 const isolated=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process}));assert.equal(isolated.require,'undefined');assert.equal(isolated.process,'undefined');save('渲染器不暴露Node或进程API',isolated);
 result.completedAt=new Date().toISOString();fs.writeFileSync('docs/test-evidence/desktop-ai-controls.json',JSON.stringify(result,null,2));
 }catch(e){result.failure=e.stack;fs.writeFileSync('docs/test-evidence/desktop-ai-controls.json',JSON.stringify(result,null,2));console.error(e);process.exitCode=1}finally{await app?.close().catch(()=>{})}})();
