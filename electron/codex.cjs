const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');

class CodexClient extends EventEmitter {
  constructor({executable,home,cwd}) {super();Object.assign(this,{executable,home,cwd});this.pending=new Map();this.seq=0;}
  async start(){
    if(this.ready)return this.ready;
    const ready=this._start().catch(e=>{if(this.ready===ready)this.ready=null;throw e});this.ready=ready;return ready;
  }
  async _start(){
    fs.mkdirSync(this.home,{recursive:true});fs.mkdirSync(this.cwd,{recursive:true});
    // All overrides are per-process. The user's global configuration is never read or written.
    const args=['app-server','--listen','stdio://','-c','cli_auth_credentials_store="keyring"','-c','model_provider="openai"','-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.apply_patch_freeform=false','-c','features.multi_agent=false','-c','features.apps=false','-c','features.js_repl=false','-c','features.code_mode=false','-c','tools.view_image=false','-c','project_doc_max_bytes=0'];
    const env={...process.env,CODEX_HOME:this.home};
    for(const key of Object.keys(env))if(/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|CODEX_AUTH_TOKEN)$/.test(key))delete env[key];
    this.child=spawn(this.executable,args,{cwd:this.cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const child=this.child;
    child.on('error',e=>{if(this.child===child)this.fail(e)});
    child.on('exit',(code)=>{if(this.child!==child)return;this.child=null;this.ready=null;this.fail(new Error(`官方 App Server 已退出（${code}）`));this.emit('disconnected')});
    this.child.stderr.on('data',()=>{}); // Credentials and upstream diagnostic payloads never enter product logs.
    readline.createInterface({input:this.child.stdout}).on('line',line=>{
      let m;try{m=JSON.parse(line)}catch{return}
      if(m.id!==undefined && !m.method){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message||JSON.stringify(m.error))):p.resolve(m.result);return;}
      if(m.id!==undefined&&m.method){
        // This coach has no tool permissions. Never approve execution or unrelated file access.
        const result=m.method.includes('requestApproval')?{decision:'decline'}:null;
        this.send(result?{id:m.id,result}:{id:m.id,error:{code:-32601,message:'Hot100 Coach 不允许工具执行或额外授权'}});
        this.emit('blockedTool',{method:m.method});return;
      }
      this.emit('notification',m);
    });
    const info=await this.request('initialize',{clientInfo:{name:'hot100_ai_coach',title:'Hot100 AI Coach',version:require('../package.json').version}});
    this.send({method:'initialized',params:{}});this.version=info?.userAgent?.match(/(?:codex_cli_rs|codex-cli)[/ ]([\d.]+)/)?.[1]||null;return info;
  }
  send(value){if(!this.child?.stdin.writable)throw new Error('App Server 未连接');this.child.stdin.write(JSON.stringify(value)+'\n');}
  request(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} 请求超时，请检查网络或重新登录`))},timeout);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}})}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e)}this.pending.clear()}
  async listModels(){
    await this.start();const models=new Map(),seen=new Set();let cursor;
    do{
      const response=await this.request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});
      if(!Array.isArray(response?.data))throw new Error('官方模型列表返回格式无效，请稍后刷新');
      for(const model of response.data){const id=model.model||model.id;if(typeof id==='string'&&id&&!model.hidden)models.set(id,model)}
      cursor=response.nextCursor;
      if(cursor){if(typeof cursor!=='string'||seen.has(cursor)||seen.size>=100)throw new Error('官方模型列表分页异常，请稍后刷新');seen.add(cursor)}
    }while(cursor);
    if(!models.size)throw new Error('官方服务未返回可选择的模型，请稍后刷新');
    this.modelsUpdatedAt=new Date().toISOString();return [...models.values()];
  }
  async restartForModels(){
    this.close();
    // Only invalidate this application's model catalog; authentication remains in the official keyring.
    const cache=path.join(this.home,'models_cache.json');
    if(fs.existsSync(cache)){fs.copyFileSync(cache,path.join(this.home,'models_cache.before-refresh.json'));fs.unlinkSync(cache)}
    await this.start();
  }
  async account(options={}){
    if(this.accountPending){
      if(!options.refreshModels||this.accountRefreshing)return this.accountPending;
      await this.accountPending.catch(()=>{});return this.account(options);
    }
    this.accountRefreshing=!!options.refreshModels;
    const task=this.readAccount(options);this.accountPending=task;
    try{return await task}finally{if(this.accountPending===task){this.accountPending=null;this.accountRefreshing=false}}
  }
  async readAccount({refreshModels=false}={}){
    if(refreshModels)await this.restartForModels();else await this.start();
    const auth=await this.request('account/read',{refreshToken:refreshModels});
    const [models,limits]=await Promise.allSettled([this.listModels(),auth.account?this.request('account/rateLimits/read'):Promise.resolve(null)]);
    return {...auth,models:models.status==='fulfilled'?models.value:[],modelsError:models.status==='rejected'?models.reason.message:null,
      modelsUpdatedAt:models.status==='fulfilled'?this.modelsUpdatedAt:null,appServerVersion:this.version,
      rateLimits:limits.status==='fulfilled'?limits.value:null,limitsError:limits.status==='rejected'?limits.reason.message:null};
  }
  async login(){await this.start();return this.request('account/login/start',{type:'chatgpt',useHostedLoginSuccessPage:true,appBrand:'codex'});}
  close(){const child=this.child;this.child=null;this.ready=null;child?.stdin.end();child?.kill();this.fail(new Error('App Server 已关闭'));if(child)this.emit('disconnected')}
}
module.exports={CodexClient};
