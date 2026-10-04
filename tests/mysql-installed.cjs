// Smoke test for the packaged Windows application with an isolated learning profile.
// Clicks the production Run button; no test bridge, AI mock, or real AI request.
'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const exe=process.argv[2]||path.join(process.env.LOCALAPPDATA,'Programs','Hot100 AI Coach','Hot100 AI Coach.exe');
const mode=process.argv[3]||'installed';
const profile=path.join(root,'.local','mysql-'+mode+'-'+Date.now());
const out=path.join(root,'docs','test-evidence');
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode,isolatedProfile:true,realAI:false,productionRunButton:true,checks:[]};
const refs=require('../scripts/mysql-reference-solutions.json');
let app,page;const errors=[];
const save=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mysql-'+mode+'.json'),JSON.stringify(report,null,2)+'\n')};
const record=(name,detail)=>{report.checks.push({name,passed:true,detail});save();console.log('PASS',name)};
const call=(method,params)=>page.evaluate(([m,p])=>window.coach.invoke(m,p),[method,params]);
async function launch(){
 app=await _electron.launch({executablePath:exe,args:[],cwd:path.dirname(exe),env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,COACH_TEST:undefined,COACH_USER_DATA:profile},timeout:60000});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'SQL 50',exact:true}).waitFor({timeout:60000});
 assert.equal(await app.evaluate(({app})=>app.getVersion()),report.version);
 assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 assert.equal(await app.evaluate(()=>!!globalThis.coachTest),false,'Production must not enable the development service bridge');
}
async function selectSql(id){
 const b=await call('bootstrap'),p=b.problems.find(p=>p.id===id);
 await page.getByRole('button',{name:'SQL 50',exact:true}).click();
 await page.getByLabel('搜索题目',{exact:true}).fill(p.slug);
 await page.locator('.problem-item').filter({has:page.getByText((p.displayId||p.id)+'. '+p.title,{exact:true})}).click();
 await page.getByRole('heading',{name:p.title,exact:true}).waitFor();
 await page.getByLabel('搜索题目',{exact:true}).fill('');
 return p;
}
async function run(id,code,dialect){
 const p=await selectSql(id);
 await page.getByLabel('SQL 引擎',{exact:true}).selectOption(dialect);
 await page.waitForFunction(value=>document.querySelector('[aria-label="SQL 引擎"]')?.value===value,dialect);
 await call('applySuggestion',{problemId:id,language:'sql',code});
 await page.waitForFunction(code=>document.querySelector('.view-lines')?.textContent.replace(/\s/g,'').includes(code.replace(/\s/g,'').slice(0,28)),code);
 await page.getByRole('button',{name:'运行 SQL',exact:false}).click();
 await page.waitForFunction(({count,dialect})=>{
  const summary=document.querySelector('.result-summary');
  return summary?.querySelector('.success')&&new RegExp(count+'\\s*/\\s*'+count).test(summary.textContent)&&summary.textContent.includes(dialect==='mysql'?'MySQL':'SQLite')&&document.querySelector('.run-button')?.textContent.includes('运行 SQL');
 },{count:2,dialect},{timeout:150000});
 const summary=await page.locator('.result-summary').textContent();
 assert.match(summary,dialect==='mysql'?/MySQL 8\.4\.11/:/SQLite 3/);
 assert.match(await page.locator('.problem-content').textContent(),dialect==='mysql'?/MySQL/:/SQLite/);
 return{problemId:id,passed:2,total:2,runtime:summary.split('·').at(-1).trim()};
}
async function close(){if(app){await app.close();app=null}}
(async()=>{try{
 await launch();const b=await call('bootstrap');
 assert.equal(b.runtime.sql.mysql.available,true);assert.equal(b.runtime.sql.sqlite.available,true);
 record('生产包载入真实 MySQL/SQLite 运行环境，无开发测试桥',{mysql:b.runtime.sql.mysql.version,sqlite:b.runtime.sql.sqlite.version});
 await selectSql('sql-197');assert.equal(await page.getByLabel('SQL 引擎',{exact:true}).inputValue(),'mysql');
 record('SQL 50 新学习档案默认 MySQL');
 for(const [id,feature] of [['sql-197','DATEDIFF'],['sql-1193','DATE_FORMAT'],['sql-1517','REGEXP_LIKE'],['sql-196','自连接 DELETE'],['sql-1484','GROUP_CONCAT ORDER BY SEPARATOR']])record('生产运行按钮执行 '+feature,await run(id,refs[id],'mysql'));
 record('SQLite 兼容运行按钮仍能执行旧语法',await run('sql-197',require('../scripts/sql-reference-solutions.json')['sql-197'],'sqlite'));
 await page.getByLabel('SQL 引擎',{exact:true}).selectOption('mysql');
 await call('applySuggestion',{problemId:'sql-197',language:'sql',code:refs['sql-197']});
 const expected=(await call('bootstrap')).states;
 await close();await launch();
 assert.equal(await page.getByLabel('SQL 引擎',{exact:true}).inputValue(),'mysql');
 assert.equal((await call('bootstrap')).states['sql-197'].drafts.sql,expected['sql-197'].drafts.sql);
 record('生产包重启保存 MySQL 选择与原草稿');
 await page.getByRole('button',{name:'热题 100',exact:true}).click();
 assert.equal(await page.getByLabel('编程语言',{exact:true}).inputValue(),'python');
 record('原 Hot100 Python/C++ 题单仍可独立切回');
 await selectSql('sql-197');await run('sql-197',refs['sql-197'],'mysql');
 const image=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toDataURL());
 fs.writeFileSync(path.join(out,'mysql-'+mode+'.png'),Buffer.from(image.split(',')[1],'base64'));
 await close();
 const runs=path.join(profile,'mysql-runs');
 assert.equal(fs.existsSync(runs)?fs.readdirSync(runs).filter(name=>name.startsWith('instance-')).length:0,0,'Private data directory must be removed after normal exit');
 record('生产应用退出回收私有 MySQL 数据目录');
 assert.deepEqual(errors,[]);report.rendererErrors=errors;report.passed=true;save();
 console.log('PASS production MySQL smoke:',report.checks.length,'checks');
 }catch(e){report.passed=false;report.error=e.stack||String(e);save();throw e}finally{await close()}
})().catch(e=>{console.error(e);process.exitCode=1});
