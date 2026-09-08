const path=require('node:path');
const {CodexClient}=require('../electron/codex.cjs');
const c=new CodexClient({executable:process.env.COACH_CODEX_EXE||path.resolve('runtime/codex/codex.exe'),home:path.resolve('.local/codex'),cwd:path.resolve('.local/ai-work')});
c.on('notification',m=>{
 if(m.method==='account/login/completed')console.log('account/login/completed',{success:m.params?.success===true});
 else if(m.method==='account/updated')console.log('account/updated');
 else if(m.method==='account/rateLimits/updated')console.log('account/rateLimits/updated');
});
(async()=>{try{
 await c.start();console.log('initialize','ready');
 const r=await c.account();console.log('account',{loggedIn:!!r.account,type:r.account?.type,plan:r.account?.planType,availableModels:r.models?.length||0,hasRateLimits:!!r.rateLimits,hasError:!!r.error||!!r.limitsError});
 }catch{console.error('App Server diagnostic failed; raw account and error data are omitted.');process.exitCode=1}finally{c.close()}})();
