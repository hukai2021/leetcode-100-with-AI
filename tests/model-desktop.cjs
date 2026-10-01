'use strict';
const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/test-evidence');
const profile=path.join(root,'.local','model-desktop-'+Date.now());
const reportPath=path.join(out,'model-desktop.json');
const report={version:require('../package.json').version,testedAt:new Date().toISOString(),mode:'desktop-mocked-client',isolatedProfile:true,realAiRequested:false,realAccountRead:false,checks:[]};
const choice=(reasoningEffort)=>({reasoningEffort,description:'模拟能力 '+reasoningEffort});
const fixtures=[
 {id:'test-model-a',model:'test-model-a',displayName:'测试模型 A',isDefault:true,supportedReasoningEfforts:['low','medium','high','xhigh'].map(choice),defaultReasoningEffort:'medium'},
 {id:'test-model-b',model:'test-model-b',displayName:'测试模型 B',supportedReasoningEfforts:['none','minimal','max','ultra'].map(choice),defaultReasoningEffort:'max'},
 {id:'test-model-default',model:'test-model-default',displayName:'测试默认模型'}
];
const added={id:'test-model-new',model:'test-model-new',displayName:'测试新模型',isDefault:true,supportedReasoningEfforts:['low','high'].map(choice),defaultReasoningEffort:'high'};
let app,page,popout;const pageErrors=[];
const write=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));};
const record=(name,detail)=>{report.checks.push({name,passed:true,detail});write();console.log('PASS',name);};
const call=(method,params,target=page)=>target.evaluate(([m,p])=>window.coach.invoke(m,p),[method,params]);
const waitValue=(target,label,value)=>target.waitForFunction(([label,value])=>document.querySelector('[aria-label="'+label+'"]')?.value===value,[label,value]);
const options=(target,label)=>target.getByLabel(label,{exact:true}).locator('option').evaluateAll(elements=>elements.map(option=>({value:option.value,label:option.textContent})));
async function capture(name,target=page){
 const data=await app.evaluate(async({BrowserWindow},url)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);return(await w.capturePage()).toDataURL();},target.url());
 fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));
}
async function launch(models){
 app=await _electron.launch({args:[root],env:{...process.env,COACH_USER_DATA:profile,COACH_TEST:'1'},timeout:45000});
 // Install a deterministic transport in the real service before interacting with the renderer.
 // The profile is empty/isolated; its official client is closed without reading personal credentials.
 await app.evaluate(async(_,models)=>{
  const start=Date.now();while(!globalThis.coachTest){if(Date.now()-start>15000)throw Error('COACH_TEST service not available');await new Promise(resolve=>setTimeout(resolve,20));}
  const service=globalThis.coachTest.service,client=service.client;
  client.close();
  const mock=globalThis.coachModelMock={models,error:null,delay:0,refreshes:[],turns:[],counter:0};
  client.start=async()=>{};
  client.listModels=async()=>structuredClone(mock.models);
  client.account=async(options={})=>{
   mock.refreshes.push({force:!!options.refreshModels});
   if(options.refreshModels&&mock.delay)await new Promise(resolve=>setTimeout(resolve,mock.delay));
   return {account:{type:'chatgpt'},rateLimits:null,models:structuredClone(mock.error?service.cachedAccount.models:mock.models),modelsError:mock.error,modelsUpdatedAt:new Date().toISOString()};
  };
  client.request=async(method,params)=>{
   if(method==='account/read')return{account:{type:'chatgpt'}};
   if(method==='thread/start'||method==='thread/resume')return{thread:{id:params.threadId||'mock-thread-'+(++mock.counter)}};
   if(method==='turn/start'){
    const turnId='mock-turn-'+(++mock.counter);
    mock.turns.push({method,model:params.model,effort:params.effort??null,hasEffort:Object.hasOwn(params,'effort'),threadId:params.threadId,turnId});
    return{turn:{id:turnId}};
   }
   if(method==='turn/interrupt')return{};
   throw Error('Unexpected mock request '+method);
  };
  await service.account();service.event({type:'accountChanged',account:service.cachedAccount});
 },models);
 page=await app.firstWindow();page.on('pageerror',error=>pageErrors.push(error.message));
 await page.getByRole('button',{name:'SQL 50',exact:true}).waitFor({timeout:45000});
 await page.getByLabel('选择 Codex 模型',{exact:true}).locator('option').first().waitFor({state:'attached'});
 await page.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===3||document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===4);
 await page.context().setOffline(true);
 assert.equal(await app.evaluate(({app})=>app.getVersion()),report.version);
}
async function updateMock(patch){await app.evaluate((_,patch)=>Object.assign(globalThis.coachModelMock,patch),patch);}
async function turns(){return app.evaluate(()=>structuredClone(globalThis.coachModelMock.turns));}
async function completeTurn(){
 await app.evaluate(()=>{
  const service=globalThis.coachTest.service,turn=globalThis.coachModelMock.turns.at(-1);
  service.client.emit('notification',{method:'item/agentMessage/delta',params:{threadId:turn.threadId,itemId:turn.turnId,delta:'模拟响应：仅验证模型与思考强度参数，未请求真实 AI。'}});
  service.client.emit('notification',{method:'turn/completed',params:{threadId:turn.threadId,turn:{id:turn.turnId,status:'completed'}}});
 });
 await page.waitForFunction(()=>!document.querySelector('[aria-label="选择 Codex 模型"]')?.disabled);
 if(popout)await popout.waitForFunction(()=>!document.querySelector('[aria-label="选择 Codex 模型"]')?.disabled);
}
async function waitTurn(count){await app.evaluate(async(_,count)=>{const start=Date.now();while(globalThis.coachModelMock.turns.length<count){if(Date.now()-start>15000)throw Error('Mock turn not sent');await new Promise(resolve=>setTimeout(resolve,30));}},count);}
(async()=>{
 try{
  await launch(fixtures);
  await waitValue(page,'选择 Codex 模型','test-model-a');
  assert.deepEqual(await options(page,'选择思考强度'),[{value:'low',label:'低'},{value:'medium',label:'中'},{value:'high',label:'高'},{value:'xhigh',label:'很高'}]);
  await waitValue(page,'选择思考强度','medium');
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-b');
  await waitValue(page,'选择思考强度','max');
  assert.deepEqual(await options(page,'选择思考强度'),[{value:'none',label:'无'},{value:'minimal',label:'极低'},{value:'max',label:'最高'},{value:'ultra',label:'极致'}]);
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('ultra');
  await page.waitForFunction(()=>document.querySelector('[aria-label="选择思考强度"]')?.value==='ultra');
  assert.equal((await call('bootstrap')).settings.reasoningEffort,'ultra');
  record('中文思考档位按模型能力变化，默认档位与选择持久化');

  await page.getByRole('button',{name:'SQL 50',exact:true}).click();
  const sql="SELECT product_id FROM Products WHERE low_fats = 'Y' AND recyclable = 'Y';";
  await call('applySuggestion',{problemId:'sql-1757',language:'sql',code:sql});
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-a');
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('high');
  await page.getByRole('button',{name:'提交并让 GPT 批改',exact:true}).click();
  await waitTurn(1);
  assert.equal((await turns()).at(-1).model,'test-model-a');assert.equal((await turns()).at(-1).effort,'high');
  assert.equal(await page.getByLabel('选择 Codex 模型',{exact:true}).isDisabled(),true);
  assert.equal(await page.getByLabel('选择思考强度',{exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'刷新模型',exact:true}).isDisabled(),true);
  await completeTurn();
  const submitted=(await call('history',{problemId:'sql-1757'})).submissions[0];
  assert.equal(submitted.status,'completed');assert.equal(submitted.reasoningEffort,'high');assert.equal(submitted.tests.status,'passed');
  record('真实 SQL 本地运行与 UI 提交，模拟 transport 的 turn/start 收到 effort=high，生成中配置禁用',{submissionStatus:submitted.status,testsPassed:submitted.tests.passed,turn:(await turns()).at(-1)});
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('xhigh');
  await page.getByLabel('与 AI 教练继续对话',{exact:true}).fill('模拟连续追问：请解释思路。');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await waitTurn(2);
  assert.equal((await turns()).at(-1).effort,'xhigh');await completeTurn();
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-default');
  assert.deepEqual(await options(page,'选择思考强度'),[{value:'',label:'默认'}]);
  assert.equal(await page.getByLabel('选择思考强度',{exact:true}).isDisabled(),true);
  await page.getByLabel('与 AI 教练继续对话',{exact:true}).fill('模拟默认模型追问。');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await waitTurn(3);
  assert.equal((await turns()).at(-1).hasEffort,false);await completeTurn();
  record('聊天 UI 传 xhigh；未返回能力的模型显示默认并省略 effort',{turns:(await turns()).slice(1)});

  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-a');
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('xhigh');
  const windowPromise=app.waitForEvent('window');
  await page.getByRole('button',{name:'独立弹出聊天窗口',exact:true}).click();
  popout=await windowPromise;popout.on('pageerror',error=>pageErrors.push(error.message));
  await popout.getByLabel('选择 Codex 模型',{exact:true}).waitFor();
  await waitValue(popout,'选择 Codex 模型','test-model-a');await waitValue(popout,'选择思考强度','xhigh');
  await popout.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-b');
  await waitValue(page,'选择 Codex 模型','test-model-b');await waitValue(page,'选择思考强度','max');
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('ultra');await waitValue(popout,'选择思考强度','ultra');
  record('主窗口和独立聊天窗口双向同步模型与思考选择');

  const backgroundModel={...added,id:'test-model-background',model:'test-model-background',displayName:'测试后台新模型',isDefault:false};
  await updateMock({models:[...fixtures,backgroundModel]});
  await call('account');
  await page.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===4);
  await popout.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===4);
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-background');
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('low');
  await waitValue(popout,'选择 Codex 模型','test-model-background');await waitValue(popout,'选择思考强度','low');
  // Observe the deferred settingsChanged/reconciliation cycle to detect a stale-window bounce.
  await page.waitForTimeout(750);
  for(const target of [page,popout]){
   assert.equal(await target.getByLabel('选择 Codex 模型',{exact:true}).inputValue(),'test-model-background');
   assert.equal(await target.getByLabel('选择思考强度',{exact:true}).inputValue(),'low');
  }
  const backgroundSaved=(await call('bootstrap')).settings;
  assert.equal(backgroundSaved.model,'test-model-background');assert.equal(backgroundSaved.reasoningEffort,'low');
  assert.equal((await app.evaluate(()=>globalThis.coachModelMock.refreshes)).at(-1).force,false);
  record('普通 account 刷新同步全窗口目录，新增模型选择保持稳定且不会被旧目录反向回退',{model:backgroundSaved.model,reasoningEffort:backgroundSaved.reasoningEffort});
  await page.getByLabel('选择 Codex 模型',{exact:true}).selectOption('test-model-b');
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('ultra');
  await updateMock({models:fixtures});await call('account');
  await popout.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===3);

  await updateMock({models:[...fixtures,added],delay:800});
  await popout.getByRole('button',{name:'刷新模型',exact:true}).click();
  await popout.waitForFunction(()=>document.querySelector('[aria-label="刷新模型"]')?.disabled);
  await popout.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===4);
  await page.waitForFunction(()=>document.querySelector('[aria-label="选择 Codex 模型"]')?.options.length===4);
  await popout.locator('.model-feedback').filter({hasText:'已同步 4 个模型'}).waitFor();
  assert.equal((await app.evaluate(()=>globalThis.coachModelMock.refreshes)).at(-1).force,true);
  record('弹出窗口手动强制刷新新增模型，两窗口同步且显示成功反馈');
  const finalModels=[{...fixtures[0],isDefault:false},fixtures[2],added];
  await updateMock({models:finalModels,delay:0});
  await page.getByRole('button',{name:'刷新模型',exact:true}).click();
  await waitValue(page,'选择 Codex 模型','test-model-new');await waitValue(popout,'选择 Codex 模型','test-model-new');
  await waitValue(page,'选择思考强度','high');
  await page.locator('.model-feedback').filter({hasText:'已切换为 测试新模型'}).waitFor();
  assert.equal((await call('bootstrap')).settings.model,'test-model-new');
  record('刷新移除当前模型，回退服务默认模型、提示用户并持久化');
  const beforeFailure=await options(page,'选择 Codex 模型');
  await updateMock({error:'模拟离线，无法获取模型目录'});
  await page.getByRole('button',{name:'刷新模型',exact:true}).click();
  await page.locator('.model-feedback-error').filter({hasText:'模拟离线'}).waitFor();
  assert.deepEqual(await options(page,'选择 Codex 模型'),beforeFailure);
  assert.equal(await page.getByLabel('选择 Codex 模型',{exact:true}).inputValue(),'test-model-new');
  await popout.locator('.model-feedback-error').filter({hasText:'模拟离线'}).waitFor();
  record('模拟刷新失败保留已有模型和选择，并在两窗口显示错误');
  await updateMock({error:null});
  await page.getByTitle('设置与数据',{exact:true}).click();
  await page.getByRole('button',{name:'刷新账户与模型',exact:true}).click();
  await page.locator('.settings-modal .model-feedback').filter({hasText:'已同步 3 个模型'}).waitFor();
  await page.locator('.settings-modal .modal-heading button').click();
  assert.equal(await page.locator('.model-feedback-error').count(),0);
  record('设置页使用相同强制刷新，恢复后清除错误');

  await app.evaluate(()=>globalThis.coachTest.mainWindow.setContentSize(1300,820));
  await page.waitForFunction(()=>window.innerWidth===1300);
  const handle=await page.locator('.resize-handle').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+100);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+64,handle.y+100);await page.mouse.up();
  const bounds=await page.evaluate(()=>{
   const panel=document.querySelector('.chat-panel'),p=panel.getBoundingClientRect();
   const controls=[...panel.querySelectorAll('.model-row select,.reasoning-picker,.model-actions button,.model-actions>span')].map(element=>{const r=element.getBoundingClientRect();return{text:element.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,inside:r.x>=p.x-1&&r.right<=p.right+1&&r.bottom<=p.bottom+1};});
   const row=panel.querySelector('.model-row');return{viewport:innerWidth,chatWidth:p.width,rowWidth:row.clientWidth,rowScrollWidth:row.scrollWidth,controls};
  });
  assert.ok(Math.abs(bounds.chatWidth-290)<=1,JSON.stringify(bounds));
  assert.ok(bounds.rowScrollWidth<=bounds.rowWidth+1,JSON.stringify(bounds));
  for(const control of bounds.controls)assert.ok(control.inside&&control.width>0&&control.height>0,JSON.stringify(control));
  await capture('model-desktop.png');await capture('model-desktop-popout.png',popout);
  record('1300 像素窗口、290 像素聊天栏控件可见无裁切',bounds);
  await popout.close();popout=null;
  await page.getByLabel('选择思考强度',{exact:true}).selectOption('low');
  await app.close();app=null;
  await launch(finalModels);
  await waitValue(page,'选择 Codex 模型','test-model-new');await waitValue(page,'选择思考强度','low');
  const restored=(await call('bootstrap')).settings;
  assert.equal(restored.model,'test-model-new');assert.equal(restored.reasoningEffort,'low');
  record('同一独立学习档案重启恢复模型与思考强度',{model:restored.model,reasoningEffort:restored.reasoningEffort});
  assert.deepEqual(pageErrors,[]);report.passed=true;report.completedAt=new Date().toISOString();write();
  console.log('MODEL_DESKTOP_PASSED (mocked model/AI transport; real Electron, IPC, service, storage and SQL runner)');
 }catch(error){report.passed=false;report.error=error.stack||String(error);report.pageErrors=pageErrors;write();if(app&&page)await capture('model-desktop-failure.png').catch(()=>{});console.error(error);process.exitCode=1;}
 finally{if(app)await app.close().catch(()=>{});}
})();