'use strict';
// Launch either the development app or the installed executable in an isolated learning profile.
// No login or AI generation is requested.
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),exe=process.argv[2];
const mode=exe?'installed':'desktop',out=path.join(root,'docs/test-evidence');
const report={testedAt:new Date().toISOString(),mode,executable:exe||'development Electron',checks:[]};
let app,page;
const record=(name,detail)=>{report.checks.push({name,passed:true,detail});fs.writeFileSync(path.join(out,'chinese-'+mode+'.json'),JSON.stringify(report,null,2));console.log('PASS',name)};
const call=(m,p)=>page.evaluate(([m,p])=>window.coach.invoke(m,p),[m,p]);
(async()=>{
 try {
  const opts={env:{...process.env,COACH_USER_DATA:path.join(root,'.local','chinese-'+mode+'-'+Date.now())}};
  if(exe){opts.executablePath=exe;opts.args=[]}else opts.args=[root];
  app=await _electron.launch(opts);page=await app.firstWindow();
  await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).waitFor({timeout:45000});
  await page.context().setOffline(true);
  const version=await app.evaluate(({app})=>app.getVersion());assert.equal(version,require('../package.json').version);report.version=version;
  const boot=await call('bootstrap');
  boot.problems=boot.problems.filter(p=>p.collection==='hot100');
  boot.cases=Object.fromEntries(boot.problems.map(p=>[p.id,boot.cases[p.id]]));
  assert.equal(boot.problems.length,100);assert.ok(boot.problems.every(p=>p.source?.contentLanguage==='zh-CN'&&/[\u4e00-\u9fff]/.test(p.content)));
  assert.equal(boot.problems.filter(p=>p.source.translation).length,98);
  assert.equal(Object.values(boot.cases).reduce((a,c)=>a+c.length,0),247);
  record('100道中文题面与247个原有样例加载',{officialChinese:2,translated:98});
  const visited=[];
  for(const p of boot.problems) {
   await page.getByLabel('搜索题目',{exact:true}).fill(p.slug);
   const row=page.locator('.problem-item').filter({has:page.getByText(`${p.id}. ${p.title}`,{exact:true})});
   await row.click();await page.getByRole('heading',{name:p.title,exact:true}).waitFor();
   const source=await page.locator('.source-banner>span').textContent();
   assert.equal(source,p.source.translation?'中文译文':'中文题面');
   const content=await page.locator('.problem-content').textContent();
   assert.match(content,/示例/);assert.match(content,/提示|约束/);
   assert.doesNotMatch(content,/\b(?:Input|Output|Explanation|Constraints|Follow.up)\s*:/);
   await page.waitForFunction(()=>[...document.querySelectorAll('.problem-content img')].every(img=>img.complete&&img.naturalWidth>0));
   const loaded=await page.locator('.problem-content img').count();
   visited.push({id:p.id,title:p.title,source,loadedImages:loaded});
  }
  record('逐题实际切换100道题：中文示例/约束/来源标识与离线图片均可见',{visited,images:visited.reduce((n,v)=>n+v.loadedImages,0)});
  const refs=require('../docs/catalog-reference-sources.json');
  for(const id of ['128','160','142','146','31']){
   const r=await call('run',{problemId:id,language:'python',code:refs[id]});assert.equal(r.status,'passed',r.error);
   record('中文题面下 Python 代表题真实运行 '+id,{passed:r.passed,total:r.total});
  }
  const cpp='class Solution {public: void moveZeroes(vector<int>& nums){int k=0;for(int x:nums)if(x!=0)nums[k++]=x;while(k<(int)nums.size())nums[k++]=0;}};';
  const r=await call('run',{problemId:'283',language:'cpp',code:cpp});assert.equal(r.status,'passed',r.error);record('中文移动零题面下 C++17 真实编译运行',{passed:r.passed,total:r.total});
  await page.getByLabel('搜索题目',{exact:true}).fill('longest-consecutive-sequence');await page.locator('.problem-item').click();
  await page.locator('.problem-heading h1').filter({hasText:'最长连续序列'}).waitFor();
  await page.locator('.statement-scroll').evaluate(el=>el.scrollTop=0);
  const image=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toDataURL());
  fs.writeFileSync(path.join(out,'chinese-'+mode+'.png'),Buffer.from(image.split(',')[1],'base64'));
  report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'chinese-'+mode+'.json'),JSON.stringify(report,null,2));
 }catch(e){report.failure=e.stack;fs.writeFileSync(path.join(out,'chinese-'+mode+'.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1}
 finally{await app?.close().catch(()=>{})}
})();
