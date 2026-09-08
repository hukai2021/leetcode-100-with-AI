const {_electron}=require('playwright');
const path=require('node:path');
(async()=>{
 const application=await _electron.launch({args:[path.resolve('.')],env:{...process.env,COACH_TEST:'1'},timeout:30000});
 let reportedStderr=false;
 application.process().stderr.on('data',()=>{if(!reportedStderr){reportedStderr=true;console.error('Electron emitted diagnostics; raw output is omitted to protect account data.')}});
 const page=await application.firstWindow({timeout:30000});
 page.on('console',m=>console.log('renderer event',m.type()));page.on('pageerror',()=>console.error('renderer error; details omitted'));
 console.log('WINDOW_READY',true);
 const accountSummary=async()=>page.evaluate(async()=>{const r=await window.coach.invoke('account');return {loggedIn:!!r.account,type:r.account?.type,plan:r.account?.planType,availableModels:r.models?.length||0,hasError:!!r.error}});
 console.log('ACCOUNT',await accountSummary());
 if(process.argv.includes('--login'))console.log('LOGIN',await page.evaluate(async()=>{await window.coach.invoke('login');return '官方浏览器已打开；等待用户完成授权'}));
 let lastAccount='';
 const interval=setInterval(async()=>{try{const key=JSON.stringify(await accountSummary());if(key!==lastAccount){lastAccount=key;console.log('AUTH_STATUS',key)}}catch{}},10000);
 application.on('close',()=>{clearInterval(interval);process.exit(0)});
})().catch(()=>{console.error('Desktop diagnostic session failed; raw account and error data are omitted.');process.exitCode=1});
