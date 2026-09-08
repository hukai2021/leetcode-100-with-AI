const {app,BrowserWindow,ipcMain,shell,dialog,clipboard,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {CoachService}=require('./service.cjs');
let service,mainWindow;
let quitting=false;
const closingReady=new Set();
const root=path.resolve(__dirname,'..');
if(process.env.COACH_USER_DATA)app.setPath('userData',path.resolve(process.env.COACH_USER_DATA));
else app.setPath('userData',path.join(app.getPath('appData'),'Hot100 AI Coach'));
const lock=app.requestSingleInstanceLock();if(!lock)app.quit();
app.on('second-instance',()=>{if(mainWindow){mainWindow.show();mainWindow.focus()}});
function createWindow(problemId){
  const w=new BrowserWindow({width:problemId?570:1480,height:920,minWidth:problemId?390:1000,minHeight:660,title:problemId?'算法辅导 · Hot100 AI Coach':'Hot100 AI Coach',icon:path.join(root,'assets','icon.png'),backgroundColor:'#f6f8f7',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
  w.setMenuBarVisibility(false);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
  w.once('ready-to-show',()=>w.show());
  w.on('close',e=>{if(!quitting&&!closingReady.has(w.id)&&w.webContents.getURL().includes('/dist/')){e.preventDefault();w.webContents.send('coach:event',{type:'beforeClose'});}});
  const entry=path.join(root,'dist','index.html');
  if(fs.existsSync(entry))w.loadFile(entry,{hash:problemId?'chat='+encodeURIComponent(problemId):''});else w.loadFile(path.join(__dirname,'startup.html'));
  return w;
}
function codexExecutable(){
  const bundled=path.join(app.isPackaged?process.resourcesPath:root,'runtime','codex','codex.exe');if(fs.existsSync(bundled))return bundled;
  const npm=path.join(root,'node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');if(fs.existsSync(npm))return npm;
  const base=path.join(root,'node_modules','@openai','codex','vendor','x86_64-pc-windows-msvc','codex','codex.exe');if(fs.existsSync(base))return base;
  return process.env.COACH_CODEX_EXE||'codex.exe';
}
function safeExternal(url,auth=false){const u=new URL(url);const domains=auth?['auth.openai.com','chatgpt.com']:['leetcode.cn','leetcode.com','www.python.org','github.com'];if(u.protocol!=='https:'||!domains.includes(u.hostname))throw new Error('不受支持的外部链接');return shell.openExternal(u.href)}
async function importProblems(){
  const picked=await dialog.showOpenDialog(mainWindow,{title:'导入题目 JSON / Markdown',properties:['openFile'],filters:[{name:'题目数据',extensions:['json','md']}]});if(picked.canceled)return {canceled:true};
  const f=picked.filePaths[0];if(fs.statSync(f).size>20000000)throw new Error('文件超过 20 MB');const text=fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'');let items;
  if(f.toLowerCase().endsWith('.md')){const m=text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);if(!m)throw new Error('Markdown 需要 --- 分隔的 JSON 元数据，详见中文使用说明');items=[{...JSON.parse(m[1]),content:m[2],contentFormat:'markdown'}]}else{const x=JSON.parse(text);items=Array.isArray(x)?x:x.problems||[x]}
  if(items.length>1000)throw new Error('一次最多导入 1000 题');
  for(const p of items){if(!p||!/^[\w-]{1,80}$/.test(p.id)||typeof p.title!=='string'||typeof p.content!=='string'||!p.templates||!p.meta)throw new Error('题目必须含 id/title/content/templates/meta');if(p.url){const u=new URL(p.url);if(!['leetcode.cn','leetcode.com'].includes(u.hostname)||u.protocol!=='https:')throw new Error('原题链接必须是力扣官方 HTTPS URL')}if(p.cases&&(!Array.isArray(p.cases)||p.cases.length>100))throw new Error('用例格式不正确')}
  for(const p of items){service.store.put('problem',p.id,{...p,available:true,tags:p.tags||[],source:p.source||{url:'用户导入',verifiedAt:new Date().toISOString()}});if(p.cases)service.store.put('cases',p.id,p.cases.map(x=>({...x,source:x.source||'用户导入（自行核验）'})))}service.loadCatalog();service.event({type:'dataChanged'});return {count:items.length};
}
app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  service=await CoachService.open({userData:app.getPath('userData'),dataRoot:path.join(root,'data'),runtimeRoot:path.join(app.isPackaged?process.resourcesPath:root,'runtime'),codexExe:codexExecutable()});
  service.on('event',e=>{for(const w of BrowserWindow.getAllWindows())w.webContents.send('coach:event',e)});
  ipcMain.handle('coach:invoke',async(event,method,p={})=>{
    const sender=BrowserWindow.fromWebContents(event.sender);if(!sender||!event.senderFrame?.url.startsWith('file://'))throw new Error('不可信的调用来源');
    switch(method){
      case 'closeReady':closingReady.add(sender.id);sender.close();return true;
      case 'login':{const result=await service.invoke('login');await safeExternal(result.authUrl,true);return {loginId:result.loginId,authUrl:result.authUrl}}
      case 'openProblem':return safeExternal(service.problem(p.id).url);
      case 'copy':if(typeof p.text!=='string'||p.text.length>1000000)throw new Error('文本过大');clipboard.writeText(p.text);return true;
      case 'popout':createWindow(p.problemId);return true;
      case 'exportBackup':{const pick=await dialog.showSaveDialog(sender,{title:'导出学习备份（不含登录凭据）',defaultPath:'Hot100-学习备份-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'JSON',extensions:['json']}]});if(pick.canceled)return {canceled:true};fs.writeFileSync(pick.filePath,JSON.stringify(service.store.export(),null,2),'utf8');return {path:pick.filePath}}
      case 'importBackup':{const pick=await dialog.showOpenDialog(sender,{title:'导入学习备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(pick.canceled)return {canceled:true};const f=pick.filePaths[0];if(fs.statSync(f).size>100000000)throw new Error('备份超过 100 MB');const data=JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));fs.writeFileSync(path.join(app.getPath('userData'),'learning','before-import-'+Date.now()+'.json'),JSON.stringify(service.store.export()));service.store.import(data);service.loadCatalog();service.event({type:'dataChanged'});return {success:true}}
      case 'importProblems':return importProblems();
      case 'environment':return service.detectRuntime();
      default:return service.invoke(method,p);
    }
  });
  mainWindow=createWindow();
  // Read-only account discovery does not block offline startup.
  service.account().then(()=>service.event({type:'accountChanged'}));
  if(!app.isPackaged&&process.env.COACH_TEST==='1')globalThis.coachTest={service,mainWindow};
}).catch(e=>{dialog.showErrorBox('Hot100 AI Coach 启动失败',e.message);app.quit()});
app.on('before-quit',()=>{quitting=true;service?.close()});
app.on('window-all-closed',()=>app.quit());
