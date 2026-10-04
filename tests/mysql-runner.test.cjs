'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {MysqlRunner}=require('../electron/mysql-runner.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/test-evidence');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const definition={kind:'sql',sql:{dialect:'sqlite',orderMatters:false,mode:'query',tables:[{name:'T',columns:[{name:'id',type:'INTEGER'},{name:'name',type:'TEXT'}]}],mysqlTables:[{name:'T',columns:[{name:'id',type:'INT'},{name:'name',type:'VARCHAR(100)'}]}]}};
const fixture=(columns=['id'],rows=[[1]])=>[{input:[{T:[[1,'中文'],[2,'second']]}],expected:{columns,rows}}];
async function worker(){const r=new MysqlRunner({runtimeRoot:path.join(root,'runtime'),workRoot:process.argv.at(-1)});await r.start();const pid=Number(r.logs.match(/starting as process\s+(\d+)/)?.[1]);assert.ok(pid);process.send({port:r.port,guardPid:r.child.pid,serverPid:pid,cwd:r.cwd});setInterval(()=>{},1000)}
if(process.argv.includes('--mysql-owner-worker'))worker().catch(e=>{process.send?.({error:e.message});process.exitCode=1});
else{
 test('Real MySQL execution limits, account isolation, cancellation and process lifetime',{timeout:180000},async t=>{
  const working=path.join(root,'.local','mysql-restrictions-'+Date.now()),r=new MysqlRunner({runtimeRoot:path.join(root,'runtime'),workRoot:working});
  const report={version:require('../package.json').version,testedAt:new Date().toISOString(),realMySQL:true,realAI:false,checks:[]};
  const checked=async(name,fn)=>{await t.test(name,async()=>{await fn();report.checks.push({name,passed:true})})};
  const execute=(code,cases=fixture(),options={})=>r.run({problem:definition,language:'sql',code,cases,...options});
  const denied=async(code,cases=fixture())=>{const result=await execute(code,cases);assert.notEqual(result.status,'passed');assert.ok(result.error||result.cases.some(c=>c.error),JSON.stringify(result))};
  try{
   await r.start();assert.match((await r.detect()).version,/MySQL 8\.4/);
   await checked('Actual MySQL date functions, regex, Unicode and NULL',async()=>{
    const sql="SELECT DATEDIFF('2020-03-02','2020-02-28') AS days, DATE_FORMAT('2020-03-02','%Y-%m') AS month, REGEXP_LIKE('Ab@leetcode.com','^[A-Za-z]+@leetcode[.]com$','c') AS valid, IFNULL(NULL,'中文') AS label;";
    const result=await execute(sql,fixture(['days','month','valid','label'],[[3,'2020-03',1,'中文']]));assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.sqlDialect,'mysql');assert.match(result.runtime,/MySQL 8\.4/);
   });
   await checked('Restricted account denies system data, writes, extra statements and executable comments',async()=>{
    for(const sql of ['SELECT User FROM mysql.user;','CREATE TABLE forbidden (id INT);','UPDATE T SET id=0;','SELECT id FROM T; DELETE FROM T;','SELECT /*!50000 SLEEP(10) */ 1;'])await denied(sql);
    const file=path.join(working,'must-not-write.txt').replace(/\\/g,'/');await denied("SELECT 1 INTO OUTFILE '"+file+"';");assert.equal(fs.existsSync(file),false);
    const protectedPath=path.join(working,'synthetic-file.txt');fs.mkdirSync(working,{recursive:true});fs.writeFileSync(protectedPath,'synthetic-'+crypto.randomBytes(16).toString('hex'));
    const sql="SELECT LOAD_FILE('"+protectedPath.replace(/\\/g,'/')+"') AS secret;";const result=await execute(sql,fixture(['secret'],[[null]]));assert.equal(result.status,'passed',JSON.stringify(result));fs.unlinkSync(protectedPath);
    const quoted=await execute("SELECT '; /* not executable */' AS text;",fixture(['text'],[['; /* not executable */']]));assert.equal(quoted.status,'passed');
   });
   await checked('Every case resets tables and DELETE is restricted to its declared table',async()=>{
    const problem=JSON.parse(JSON.stringify(definition));problem.sql.mode='delete';problem.sql.resultTable='T';problem.sql.tables.push({name:'Other',columns:[{name:'id',type:'INTEGER'}]});problem.sql.mysqlTables.push({name:'Other',columns:[{name:'id',type:'INT'}]});
    const cases=[{input:[{T:[[1,'中文'],[2,'second']],Other:[[9]]}],expected:{columns:['id','name'],rows:[[2,'second']]}}];
    const bad=await r.run({problem,code:'DELETE FROM Other;',cases});assert.equal(bad.status,'failed');assert.match(bad.cases[0].error,/denied/i);
    for(let i=0;i<2;i++){const result=await r.run({problem,code:'DELETE FROM T WHERE id=1;',cases});assert.equal(result.status,'passed',JSON.stringify(result))}
    const rows=await execute('SELECT id FROM T;',fixture(['id'],[[1],[2]]));assert.equal(rows.status,'passed');
   });
   await checked('Row, byte and binary result limits are enforced',async()=>{
    const rows=Array.from({length:32},(_,i)=>[i,'x']);await denied('SELECT a.id FROM T a CROSS JOIN T b;',[{input:[{T:rows}],expected:{columns:['id'],rows:[[1]]}}]);
    await denied("SELECT RPAD('x',200000,'x') AS large;");await denied("SELECT UNHEX('41') AS binary_value;");
   });
   await checked('Timeout and user cancellation stop real SQL then permit the next query',async()=>{
    const start=Date.now(),timed=await execute('SELECT SLEEP(10) AS id;',fixture(),{timeoutMs:300});assert.notEqual(timed.status,'passed');assert.ok(timed.cases[0].error);assert.ok(Date.now()-start<5000);
    const pending=execute('SELECT SLEEP(10) AS id;',fixture(),{timeoutMs:3000});const deadline=Date.now()+5000;while(!r.queryConnection&&Date.now()<deadline)await delay(20);assert.ok(r.queryConnection);r.stop();const cancelled=await pending;assert.equal(cancelled.status,'cancelled');
    const recovered=await execute('SELECT id FROM T WHERE id=1;');assert.equal(recovered.status,'passed');
   });
   await checked('Unexpected private server exit cleans its old directory and restarts',async()=>{
    const old=r.cwd;r.child.kill();await r.exitPromise;const recovered=await execute('SELECT id FROM T WHERE id=1;');assert.equal(recovered.status,'passed',JSON.stringify(recovered));assert.equal(fs.existsSync(old),false);
   });
   await checked('Application process death terminates the owned MySQL server',async()=>{
    const crashRoot=path.join(working,'owner-crash');const child=fork(__filename,['--mysql-owner-worker',crashRoot],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let stderr='';child.stderr.on('data',d=>stderr=(stderr+d).slice(-5000));
    try{
     const info=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker start timeout '+stderr)),60000);child.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m)});child.once('error',reject);child.once('exit',code=>reject(Error('Worker exited '+code+' '+stderr)))});
     const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;
     const exists=pid=>{try{process.kill(pid,0);return true}catch{return false}};
     const deadline=Date.now()+15000;while((exists(info.guardPid)||exists(info.serverPid))&&Date.now()<deadline)await delay(100);
     assert.equal(exists(info.guardPid),false,'Process guard must exit when its owner dies');assert.equal(exists(info.serverPid),false,'Owned mysqld must not become an orphan');
     await new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port:info.port});socket.once('connect',()=>{socket.destroy();reject(Error('Private server still listening'))});socket.once('error',()=>resolve())});
     const absolute=path.resolve(info.cwd);assert.ok(absolute.startsWith(path.resolve(crashRoot)+path.sep));fs.rmSync(absolute,{recursive:true,force:true});
    }finally{if(child.exitCode===null)child.kill()}
   });
   report.passed=report.checks.length===7;
  }finally{await r.close();report.closed=true;fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mysql-runner.json'),JSON.stringify(report,null,2));}
  assert.equal(report.passed,true);
 });
}
