'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const {pythonHarness, cppHarness} = require('./runner-harness.cjs');

const OUTPUT_LIMIT=256*1024;
const ISOLATION='独立工作目录、最小环境变量、Windows Job Object 超时/256 MiB 内存/进程树回收；不是安全沙箱，仍有当前用户的文件和网络权限，请仅运行可信代码。';
function same(a,b) {if(typeof a==='number'&&typeof b==='number')return Number.isFinite(a)&&Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(b));return isDeepStrictEqual(a,b);}
function normalized(x,inner){if(!Array.isArray(x))return x;return x.map(a=>inner&&Array.isArray(a)?normalized(a,true):a).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
function balancedBST(actual,values){
 if(!Array.isArray(actual))return false;if(!actual.length)return values.length===0;if(actual[0]===null)return false;
 const root={v:actual[0]},queue=[root];let i=1;
 for(let q=0;q<queue.length&&i<actual.length;q++){const node=queue[q];for(const side of ['left','right']){if(i<actual.length&&actual[i]!==null){node[side]={v:actual[i]};queue.push(node[side]);}i++;}}
 if(i<actual.length&&actual.slice(i).some(x=>x!==null))return false;
 const inorder=[];let okay=true;function walk(n){if(!n)return 0;const a=walk(n.left);inorder.push(n.v);const b=walk(n.right);if(Math.abs(a-b)>1)okay=false;return 1+Math.max(a,b);}walk(root);
 return okay&&same(inorder,values);
}
function compare(problem,input,expected,actual){
 const s=problem.slug||problem.titleSlug;
 if(s==='two-sum')return Array.isArray(actual)&&actual.length===2&&actual.every(i=>Number.isInteger(i)&&i>=0&&i<input[0].length)&&actual[0]!==actual[1]&&input[0][actual[0]]+input[0][actual[1]]===input[1];
 if(s==='longest-palindromic-substring')return typeof actual==='string'&&input[0].includes(actual)&&actual===Array.from(actual).reverse().join('')&&actual.length===expected.length;
 if(s==='convert-sorted-array-to-binary-search-tree')return balancedBST(actual,input[0]);
 if(s==='top-k-frequent-elements') {if(!Array.isArray(actual)||actual.length!==input[1]||new Set(actual).size!==actual.length)return false;const counts=new Map();for(const x of input[0])counts.set(x,(counts.get(x)||0)+1);let min=Math.min(...actual.map(x=>counts.get(x)||-Infinity));return min>0&&[...counts].filter(([x])=>!actual.includes(x)).every(([,n])=>n<=min);}
 const unordered=new Set(['3sum','group-anagrams','subsets','combination-sum','permutations','letter-combinations-of-a-phone-number','generate-parentheses','n-queens','palindrome-partitioning','merge-intervals']);
 if(unordered.has(s))return same(normalized(actual,['3sum','group-anagrams','subsets','combination-sum'].includes(s)),normalized(expected,['3sum','group-anagrams','subsets','combination-sum'].includes(s)));
 if(s==='find-all-anagrams-in-a-string')return same(normalized(actual),normalized(expected));
 return same(actual,expected);
}
class Runner {
 constructor({runtimeRoot=path.join(__dirname,'../runtime'),workRoot=path.join(os.tmpdir(),'hot100-runner')}={}){this.runtimeRoot=path.resolve(runtimeRoot);this.workRoot=path.resolve(workRoot);this.child=null;this.running=false;this.cancelled=false;}
 env(cwd,exe){const win=process.env.SystemRoot||'C:\\Windows';return {SystemRoot:win,WINDIR:win,COMSPEC:path.join(win,'System32','cmd.exe'),PATH:[path.dirname(exe),path.join(this.runtimeRoot,'w64devkit','bin'),path.join(win,'System32')].join(path.delimiter),TEMP:cwd,TMP:cwd,HOME:cwd,USERPROFILE:cwd,PYTHONIOENCODING:'utf-8',PYTHONHASHSEED:'0'};}
 async detect(){
  const probe=async(name,candidates)=>{for(const exe of candidates){if(path.isAbsolute(exe)&&!fsSync.existsSync(exe))continue;let r=await new Promise(resolve=>{const c=spawn(exe,['--version'],{windowsHide:true,env:this.env(this.workRoot,exe)});let output='';const timer=setTimeout(()=>c.kill(),5000);c.stdout.on('data',d=>output+=d);c.stderr.on('data',d=>output+=d);c.on('error',()=>{clearTimeout(timer);resolve(null)});c.on('close',code=>{clearTimeout(timer);resolve(code===0?output.split(/\r?\n/)[0]:null)})});if(r)return {available:true,path:exe,version:r};}return {available:false,path:null,version:null};};
  const [python,cpp]=await Promise.all([probe('python',[path.join(this.runtimeRoot,'python','python.exe'),'C:\\Python312\\python.exe','python3','python']),probe('cpp',[path.join(this.runtimeRoot,'w64devkit','bin','g++.exe'),'g++','clang++'])]);
  return {python,cpp,isolation:fsSync.existsSync(path.join(this.runtimeRoot,'runner-job.exe'))?ISOLATION:'普通子进程：超时、停止、输出上限；未检测到 Job Object 资源限制，不是安全沙箱。'};
 }
 stop(){this.cancelled=true;if(this.child){this.child.kill();}}
 async format({language,code}){
  if(!['python','cpp'].includes(language)||typeof code!=='string'||code.length>256000)throw Error('格式化需要 Python/C++ 代码，长度须小于 256 KB');
  const isolated=new Runner({runtimeRoot:this.runtimeRoot,workRoot:this.workRoot});await fs.mkdir(this.workRoot,{recursive:true});const cwd=await fs.mkdtemp(path.join(this.workRoot,'format-'));
  try{
   const input=path.join(cwd,language==='python'?'input.py':'input.cpp');await fs.writeFile(input,code);
   let exe,args;if(language==='python'){exe=path.join(this.runtimeRoot,'python','python.exe');args=['-I','-X','utf8','-B',path.join(this.runtimeRoot,'formatters','format-python.py'),input];}
   else{exe=path.join(this.runtimeRoot,'formatters','clang_format','data','bin','clang-format.exe');args=['--style={BasedOnStyle: LLVM, IndentWidth: 4, ColumnLimit: 100}',input];}
   if(!fsSync.existsSync(exe))throw Error('格式化工具未安装，请重新安装完整应用');const r=await isolated.execute(exe,args,cwd,15000);if(r.error)throw Error('格式化失败：'+r.error+'\n'+r.stderr);
   return {code:r.stdout.replace(/\r\n/g,'\n'),formatter:language==='python'?'autopep8 2.3.2':'clang-format 23.1.0'};
  }finally{await fs.rm(cwd,{recursive:true,force:true,maxRetries:2});}
 }
 async execute(exe,args,cwd,timeoutMs,memoryMb=256){
  if(this.cancelled)return {error:'已停止',cancelled:true,stdout:'',stderr:'',durationMs:0};
  const launcher=path.join(this.runtimeRoot,'runner-job.exe');const guarded=process.platform==='win32'&&fsSync.existsSync(launcher);
  return new Promise(resolve=>{const start=Date.now();let stdout='',stderr='',bytes=0,error=null,done=false;const c=spawn(guarded?launcher:exe,guarded?[String(memoryMb),String(timeoutMs),exe,...args]:args,{cwd,env:this.env(cwd,exe),windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=c;
   const timer=setTimeout(()=>{error='执行超时';c.kill();},timeoutMs+1000);
   const append=(where,d)=>{bytes+=d.length;if(bytes>OUTPUT_LIMIT){error='输出超过 256 KiB 上限';c.kill();return;}if(where==='out')stdout+=d.toString('utf8');else stderr+=d.toString('utf8');};c.stdout.on('data',d=>append('out',d));c.stderr.on('data',d=>append('err',d));
   const finish=code=>{if(done)return;done=true;clearTimeout(timer);if(this.child===c)this.child=null;resolve({stdout,stderr,exitCode:code,durationMs:Date.now()-start,error:this.cancelled?'已停止':error||(code===124?'执行超时':code!==0?`进程退出（代码 ${code}）`:null),cancelled:this.cancelled});};c.on('error',e=>{error=e.message;finish(-1)});c.on('close',finish);
  });
 }
 async run({problem,language,code,cases,timeoutMs=3000}){
  if(this.running)return {status:'error',passed:0,total:0,cases:[],error:'已有运行任务，请先停止。'};
  this.running=true;this.cancelled=false;const start=Date.now();let cwd;
  const result={status:'error',passed:0,total:cases?.length||0,cases:[],durationMs:0,language,limits:{timeoutMs:Math.max(100,Math.min(Number(timeoutMs)||3000,30000)),outputBytes:OUTPUT_LIMIT,memoryMb:256},isolation:ISOLATION};
  try{
   if(!['python','cpp'].includes(language))throw Error('不支持的语言');if(typeof code!=='string'||code.length>256000)throw Error('代码必须小于 256 KB');if(!Array.isArray(cases)||!cases.length||cases.length>100)throw Error('请提供 1 至 100 个测试用例');
   for(const c of cases){if(!Array.isArray(c.input))throw Error('用例 input 必须为参数数组');if(!Object.hasOwn(c,'expected'))throw Error('用例缺少 expected，无法判定通过');}
   if(JSON.stringify(cases).length>2*1024*1024)throw Error('用例输入合计必须小于 2 MiB');
   const detected=await this.detect();result.isolation=detected.isolation;const env=detected[language];if(!env.available)throw Error(language==='cpp'?'未检测到 C++ 编译器，请重新安装完整应用。':'未检测到 Python 解释器，请重新安装完整应用。');
   await fs.mkdir(this.workRoot,{recursive:true});cwd=await fs.mkdtemp(path.join(this.workRoot,'run-'));const token=crypto.randomBytes(16).toString('hex');
   let exe=env.path,args;
   if(language==='python'){await fs.writeFile(path.join(cwd,'main.py'),pythonHarness(problem,code,token));await fs.writeFile(path.join(cwd,'cases.json'),JSON.stringify(cases));args=i=>['-I','-X','utf8','-B',path.join(cwd,'main.py'),String(i)];}
   else{await fs.writeFile(path.join(cwd,'main.cpp'),cppHarness(problem,code,cases,token));const bin=path.join(cwd,'answer.exe');const compiled=await this.execute(exe,['-std=c++17','-O1','-D_GLIBCXX_ASSERTIONS','-pipe','-fmax-errors=5',path.join(cwd,'main.cpp'),'-o',bin],cwd,45000,1536);result.compile={stdout:compiled.stdout,stderr:compiled.stderr,durationMs:compiled.durationMs};if(compiled.error)throw Error('编译失败：'+compiled.error+'\n'+compiled.stderr);exe=bin;args=i=>[String(i)];}
   for(let i=0;i<cases.length;i++){
    if(this.cancelled)break;
    const c=cases[i];const raw=await this.execute(exe,args(i),cwd,result.limits.timeoutMs);let actual=null,error=raw.error,stdout=raw.stdout;
    const marker='\n__HOT100_'+token+'__';const index=stdout.lastIndexOf(marker);if(index>=0){const encoded=stdout.slice(index+marker.length).trim();stdout=stdout.slice(0,index).replace(/\r$/,'');try{actual=JSON.parse(encoded)}catch(e){error=error||'运行结果无法解析：'+e.message;}}else if(!error)error='程序未返回可解析的运行结果';
    let passed=false;if(!error){try{passed=compare(problem,c.input,c.expected,actual)}catch(e){error='比较失败：'+e.message;}}
    result.cases.push({...c,actual,passed,stdout,stderr:raw.stderr,error,durationMs:raw.durationMs});if(passed)result.passed++;
   }
   result.status=this.cancelled?'cancelled':result.passed===result.total?'passed':'failed';
  }catch(e){result.error=e.message;result.status=this.cancelled?'cancelled':'error';}
  finally{this.child=null;this.running=false;result.durationMs=Date.now()-start;if(cwd){try{await fs.rm(cwd,{recursive:true,force:true,maxRetries:2})}catch{result.cleanupWarning='部分运行临时文件未清理；可在关闭软件后清理运行目录。';}}}
  return result;
 }
}
module.exports={Runner,compare};
