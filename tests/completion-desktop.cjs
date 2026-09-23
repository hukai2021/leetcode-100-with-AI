'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const exe=process.argv[2];
const mode=exe?'installed':'desktop';
const profile=path.join(root,'.local','completion-'+mode+'-'+Date.now());
const out=path.join(root,'docs/test-evidence');
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode,isolatedProfile:true,aiRequested:false,checks:[]};
const reportPath=path.join(out,'completion-'+mode+'.json');
const fixtures=[
 {language:'sql',collection:'SQL 50',problemId:'sql-1757',code:'select product_name, price from Product\n'},
 {language:'python',collection:'热题 100',problemId:'1',code:'price = 1\nproduct_name = "sample"\n'},
 {language:'cpp',collection:'热题 100',problemId:'1',code:'int price = 1;\nint product_count = 2;\n'}
];
let app,page;const pageErrors=[];
const save=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));};
const call=(method,params)=>page.evaluate(([m,p])=>window.coach.invoke(m,p),[method,params]);
async function screenshot(name){
 const data=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()).capturePage()).toDataURL());
 fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));
}
async function check(fixture,theme){
 await page.getByRole('button',{name:fixture.collection,exact:true}).click();
 if(fixture.language!=='sql')await page.getByLabel('编程语言',{exact:true}).selectOption(fixture.language);
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByTitle(theme==='dark'?'深色主题':'浅色主题',{exact:true}).click();
 await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
 await call('applySuggestion',{problemId:fixture.problemId,language:fixture.language,code:fixture.code});
 await page.waitForFunction(needle=>document.querySelector('.view-lines')?.textContent.includes(needle),fixture.language==='cpp'?'product_count':'product_name');
 await page.locator('.view-lines').click({position:{x:100,y:12}});
 await page.keyboard.press('Control+End');
 await page.keyboard.type('p');
 const widget=page.locator('.suggest-widget.visible');
 await widget.locator('.monaco-list-row').first().waitFor({timeout:15000});
 // Use keyboard navigation and accept a known local identifier, without calling a Monaco completion API.
 const focused=widget.locator('.monaco-list-row.focused .monaco-highlighted-label').first();
 for(let i=0;i<40&&await focused.textContent()!=='price';i++)await page.keyboard.press('ArrowDown');
 assert.equal(await focused.textContent(),'price','price must be offered after typing its first letter');
 const rows=await widget.locator('.monaco-list-row').evaluateAll(elements=>elements.map(row=>{
  const label=row.querySelector('.monaco-highlighted-label'),main=row.querySelector('.contents > .main');
  const r=row.getBoundingClientRect(),b=label?.getBoundingClientRect();
  return {text:label?.textContent||'',focused:row.classList.contains('focused'),direction:main&&getComputedStyle(main).flexDirection,
   row:{x:r.x,y:r.y,width:r.width,height:r.height},label:b&&{x:b.x,y:b.y,width:b.width,height:b.height}};
 }));
 assert.ok(rows.length>0);
 for(const item of rows){
  assert.ok(item.text.trim(),'completion labels must contain text');
  assert.ok(item.label?.width>0&&item.label?.height>0,'completion labels must have visible bounds');
  assert.ok(item.label.y>=item.row.y-1&&item.label.y+item.label.height<=item.row.y+item.row.height+1,
   fixture.language+'/'+theme+': completion label is clipped outside its row: '+JSON.stringify(item));
  assert.ok(item.label.x>=item.row.x-1&&item.label.x<item.row.x+item.row.width,'label must be inside row horizontally');
 }
 const capture='completion-'+mode+'-'+fixture.language+'-'+theme+'.png';
 await screenshot(capture);
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>document.querySelector('.view-lines .view-line:last-child')?.textContent.trim()==='price');
 assert.equal(await widget.count(),0,'accepting completion should close suggestions');
 report.checks.push({language:fixture.language,theme,passed:true,typed:'p',accepted:'price',rows,screenshot:capture});
 save();console.log('PASS',fixture.language,theme,'visible labels and keyboard acceptance');
 // Allow the normal debounced draft save to finish before replacing the next fixture.
 await page.waitForTimeout(600);
}
(async()=>{
 try{
  const options={args:exe?[]:[root],env:{...process.env,COACH_USER_DATA:profile,COACH_TEST:'1'},timeout:45000};
  if(exe)options.executablePath=exe;
  app=await _electron.launch(options);page=await app.firstWindow();
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.getByRole('button',{name:'SQL 50',exact:true}).waitFor({timeout:45000});
  report.actualVersion=await app.evaluate(({app})=>app.getVersion());
  await page.context().setOffline(true);
  for(const fixture of fixtures)for(const theme of ['light','dark'])await check(fixture,theme);
  assert.deepEqual(pageErrors,[]);
  report.passed=true;save();console.log('PASS all 6 completion display cases; no AI calls or personal profile used');
 }catch(e){report.passed=false;report.error=e.stack||String(e);report.pageErrors=pageErrors;save();throw e;}
 finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
