const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');

class CodexClient extends EventEmitter {
  constructor({executable,home,cwd}) {super();Object.assign(this,{executable,home,cwd});this.pending=new Map();this.seq=0;}
  async start(){
    if(this.ready)return this.ready;
    this.ready=this._start().catch(e=>{this.ready=null;throw e});return this.ready;
  }
  async _start(){
    fs.mkdirSync(this.home,{recursive:true});fs.mkdirSync(this.cwd,{recursive:true});
    // All overrides are per-process. The user's global configuration is never read or written.
    const args=['app-server','--listen','stdio://','-c','cli_auth_credentials_store="keyring"','-c','model_provider="openai"','-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.apply_patch_freeform=false','-c','features.multi_agent=false','-c','features.apps=false','-c','features.js_repl=false','-c','features.code_mode=false','-c','tools.view_image=false','-c','project_doc_max_bytes=0'];
    const env={...process.env,CODEX_HOME:this.home};
    for(const key of Object.keys(env))if(/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|CODEX_AUTH_TOKEN)$/.test(key))delete env[key];
    this.child=spawn(this.executable,args,{cwd:this.cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.on('error',e=>this.fail(e));
    this.child.on('exit',(code)=>{this.fail(new Error(`官方 App Server 已退出（${code}）`));this.ready=null;this.emit('disconnected')});
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
    this.send({method:'initialized',params:{}});return info;
  }
  send(value){if(!this.child?.stdin.writable)throw new Error('App Server 未连接');this.child.stdin.write(JSON.stringify(value)+'\n');}
  request(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} 请求超时，请检查网络或重新登录`))},timeout);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}})}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e)}this.pending.clear()}
  async account(){await this.start();const auth=await this.request('account/read',{refreshToken:false});const [models,limits]=await Promise.allSettled([this.request('model/list',{limit:100}),auth.account?this.request('account/rateLimits/read'):Promise.resolve(null)]);return {...auth,models:models.status==='fulfilled'?models.value.data:[],rateLimits:limits.status==='fulfilled'?limits.value:null,limitsError:limits.status==='rejected'?limits.reason.message:null};}
  async login(){await this.start();return this.request('account/login/start',{type:'chatgpt',useHostedLoginSuccessPage:true,appBrand:'codex'});}
  close(){this.child?.stdin.end();this.child?.kill();this.fail(new Error('App Server 已关闭'))}
}
module.exports={CodexClient};
