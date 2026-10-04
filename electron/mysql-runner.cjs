'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const mysql=require('mysql2');
const {Runner}=require('./runner.cjs');
const {compareSql,validateSqlFixture}=require('./sql-runner.cjs');
const MAX_ROWS=1000,MAX_BYTES=128*1024,MEMORY_MB=768;
const ISOLATION='官方 MySQL 私有实例仅监听 127.0.0.1 随机端口；每例新建数据库与随机受限账户，只授予题目表的 SELECT（删除题另授予指定表 DELETE）。单语句执行，禁止 FILE/DDL/跨库修改；Windows Job Object 限制实例 768 MiB 并随应用退出回收。';
const token=()=>crypto.randomBytes(12).toString('hex');
function quote(value){if(!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value))throw Error('MySQL 表名或列名无效');return '`'+value+'`'}
function mysqlType(raw){
 const original=String(raw).trim();
 if(/^ENUM\(\s*'[A-Za-z0-9_ -]{1,80}'(?:\s*,\s*'[A-Za-z0-9_ -]{1,80}')*\s*\)$/i.test(original))return 'ENUM'+original.slice(4);
 const value=String(raw).trim().toUpperCase().replace(/\s+/g,' ');
 if(/^(?:INTEGER|INT|SMALLINT|TINYINT|MEDIUMINT|BIGINT)(?:\(\d+\))?$/.test(value))return value.replace('INTEGER','INT').replace(/\(\d+\)/,'');
 if(/^(?:FLOAT|DOUBLE|REAL)(?:\(\d+(?:,\s*\d+)?\))?$/.test(value))return value.replace(/\(.*\)/,'');
 if(/^(?:DECIMAL|NUMERIC)\(\d{1,2},\s*\d{1,2}\)$/.test(value))return value;
 if(/^(?:DECIMAL|NUMERIC)$/.test(value))return 'DECIMAL(30,10)';
 if(/^(?:VARCHAR|CHAR)\(\d{1,4}\)$/.test(value))return value;
 if(['VARCHAR','ENUM'].includes(value))return 'VARCHAR(4096)';
 if(['CHAR'].includes(value))return 'CHAR(1)';
 if(['TEXT','DATE','DATETIME','TIMESTAMP','TIME','YEAR','BOOLEAN','BOOL'].includes(value))return value;
 throw Error('不支持的 MySQL 列类型：'+raw);
}
// Statements are still parsed by the real server. This lexer rejects executable
// comments and a second statement without confusing delimiters inside SQL strings.
function singleSql(code,mode){
 let plain='',quoteChar=null,line=false,block=false;
 for(let i=0;i<code.length;i++){
  const a=code[i],b=code[i+1];
  if(line){if(a==='\n'){line=false;plain+=' '}continue}
  if(block){if(a==='*'&&b==='/'){block=false;i++;plain+=' '}continue}
  if(quoteChar){if(a==='\\'){i++;continue}if(a===quoteChar){if(b===quoteChar){i++;continue}quoteChar=null}continue}
  if(a==='\''||a==='"'||a==='`'){quoteChar=a;plain+=' ';continue}
  if(a==='#'||(a==='-'&&b==='-'&&(/\s/.test(code[i+2]||' ')))){line=true;if(a==='-')i++;continue}
  if(a==='/'&&b==='*'){if(code[i+2]==='!')throw Error('练习仅允许普通 SQL，不支持可执行版本注释');block=true;i++;continue}
  plain+=a;
 }
 if(quoteChar||block)throw Error('SQL 字符串或注释未结束');
 const text=plain.trim();
 if(text.replace(/;\s*$/,'').includes(';'))throw Error('每次仅允许单条 SQL 语句');
 const first=text.match(/^[A-Za-z]+/)?.[0].toUpperCase();
 if(!(mode==='delete'?['DELETE','WITH']:['SELECT','WITH']).includes(first))throw Error(mode==='delete'?'本题仅允许单条 DELETE 删除指定表':'本题仅允许单条 SELECT/WITH 查询');
 return code.replace(/^\uFEFF/,'');
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port))})})}
class MysqlRunner{
 constructor({runtimeRoot=path.join(__dirname,'../runtime'),workRoot=path.join(os.tmpdir(),'hot100-mysql-runner')}={}){
  this.runtimeRoot=path.resolve(runtimeRoot);this.workRoot=path.resolve(workRoot);this.base=path.join(this.runtimeRoot,'mysql');this.exe=path.join(this.base,'bin','mysqld.exe');this.guard=path.join(this.runtimeRoot,'mysql-job.exe');this.processRunner=new Runner({runtimeRoot:this.runtimeRoot,workRoot:this.workRoot});this.running=false;this.cancelled=false;this.closed=false;this.logs='';
 }
 async detect(){
  if(this.detectPromise)return this.detectPromise;
  this.detectPromise=(async()=>{
   const missing=!sync.existsSync(this.exe)||(process.platform==='win32'&&!sync.existsSync(this.guard));
   if(missing)return {available:false,dialect:'mysql',version:null,error:'缺少随包 MySQL 引擎或进程管理程序，请安装完整新版应用',isolation:ISOLATION};
   const result=await new Promise(resolve=>{
    let text='',done=false;const child=spawn(this.exe,['--no-defaults','--version'],{windowsHide:true,env:this.processRunner.env(this.workRoot,this.exe)});
    const finish=value=>{if(!done){done=true;clearTimeout(timer);resolve(value)}};
    const timer=setTimeout(()=>{child.kill();finish(null)},5000);
    child.stdout.on('data',d=>{if(text.length<4096)text+=d});child.stderr.on('data',d=>{if(text.length<4096)text+=d});child.on('error',()=>finish(null));child.on('close',code=>finish(code===0?text:null));
   });
   const version=result?.match(/\bVer\s+(\d+\.\d+\.\d+)/)?.[1];
   return {available:!!version,dialect:'mysql',path:this.exe,version:version?'MySQL '+version:null,isolation:ISOLATION,...(!version?{error:'MySQL 程序无法启动，请检查完整安装与 Windows 运行库'}:{})};
  })();return this.detectPromise;
 }
 async start(){
  if(this.closed)throw Error('MySQL 运行器已关闭');
  if(this.admin&&!this.adminRaw?._closing&&!this.adminRaw?._fatalError&&this.child?.exitCode===null&&!this.child.signalCode&&!this.child.killed)return;
  if(this.startPromise)return this.startPromise;
  this.startPromise=(async()=>{if(this.child||this.cwd||this.adminRaw)await this.disposeServer();this.logs='';await this.startServer()})().catch(async error=>{await this.disposeServer();throw error}).finally(()=>{this.startPromise=null});return this.startPromise;
 }
 async startServer(){
  const detected=await this.detect();if(!detected.available)throw Error(detected.error);
  await fs.mkdir(this.workRoot,{recursive:true});this.cwd=await fs.mkdtemp(path.join(this.workRoot,'instance-'));const data=path.join(this.cwd,'data');
  const initialized=await this.processRunner.execute(this.exe,['--no-defaults','--initialize-insecure','--basedir='+this.base,'--datadir='+data,'--console','--lower-case-table-names=1','--innodb-buffer-pool-size=32M','--innodb-redo-log-capacity=32M'],this.cwd,120000,MEMORY_MB);
  if(initialized.error)throw Error('首次初始化 MySQL 失败：'+initialized.error+'\n'+initialized.stderr.slice(-6000));
  if(this.closed||this.cancelled)throw Error('MySQL 启动已停止');
  this.password=token()+token();this.adminUser='coach_admin_'+crypto.randomBytes(6).toString('hex');this.port=await freePort();const init=path.join(this.cwd,'bootstrap.sql');await fs.writeFile(init,"ALTER USER 'root'@'localhost' IDENTIFIED BY '"+this.password+"';\nCREATE USER '"+this.adminUser+"'@'127.0.0.1' IDENTIFIED BY '"+this.password+"';\nGRANT ALL PRIVILEGES ON *.* TO '"+this.adminUser+"'@'127.0.0.1' WITH GRANT OPTION;\n");
  const args=['--no-defaults','--basedir='+this.base,'--datadir='+data,'--console','--init-file='+init,'--bind-address=127.0.0.1','--port='+this.port,'--mysqlx=0','--skip-name-resolve','--skip-log-bin','--performance-schema=OFF','--innodb-buffer-pool-size=32M','--innodb-redo-log-capacity=32M','--max-connections=16','--thread-cache-size=0','--temptable-max-ram=32M','--temptable-max-mmap=0','--max-allowed-packet=4M','--secure-file-priv=NULL','--local-infile=OFF','--log-error-verbosity=1'];
  const guarded=process.platform==='win32';
  this.child=spawn(guarded?this.guard:this.exe,guarded?[String(MEMORY_MB),'4294967295',this.exe,...args]:args,{cwd:this.cwd,windowsHide:true,env:this.processRunner.env(this.cwd,this.exe),stdio:['pipe','pipe','pipe']});
  const child=this.child;child.stdin.on('error',()=>{});this.exitPromise=new Promise(resolve=>{child.once('close',code=>{this.serverExit=code;resolve(code)});child.once('error',error=>{this.logs+=error.message;resolve(-1)})});
  for(const output of [child.stdout,child.stderr])output.on('data',d=>{this.logs=(this.logs+d.toString('utf8')).slice(-16000)});
  const deadline=Date.now()+45000;let lastError;
  while(Date.now()<deadline){
   if(this.closed||this.cancelled)throw Error('MySQL 启动已停止');
   if(child.exitCode!==null||child.signalCode)throw Error('MySQL 私有实例启动失败：'+this.logs.slice(-6000));
   let connection;
   try{
    connection=mysql.createConnection({host:'127.0.0.1',port:this.port,user:this.adminUser,password:this.password,connectTimeout:1000,multipleStatements:false,enableKeepAlive:false});
    connection.on('error',()=>{});await connection.promise().query('SELECT 1');this.admin=connection.promise();this.adminRaw=connection;
    await fs.unlink(init);return;
   }catch(error){lastError=error;connection?.destroy();await sleep(200)}
  }
  throw Error('MySQL 启动超时：'+(lastError?.code||'连接失败')+'\n'+this.logs.slice(-6000));
 }
 killCurrent(){const current=this.queryConnection;if(current?.threadId&&this.admin)this.admin.query('KILL QUERY '+Number(current.threadId)).catch(()=>{});this.abortQuery?.(Error(this.cancelled?'已停止':'执行已中止'))}
 stop(){this.cancelled=true;this.processRunner.stop();this.killCurrent()}
 async queryRows(connection,code,timeoutMs){
  return new Promise((resolve,reject)=>{
   const rows=[];let columns=[],bytes=0,done=false;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);connection.removeListener('error',connectionError);this.abortQuery=null;this.queryConnection=null;error?reject(error):resolve(value)};
   const connectionError=error=>finish(error);connection.on('error',connectionError);
   const abort=error=>{if(done)return;if(connection.threadId&&this.admin)this.admin.query('KILL QUERY '+Number(connection.threadId)).catch(()=>{});connection.destroy();finish(error)};
   this.abortQuery=abort;this.queryConnection=connection;
   const timer=setTimeout(()=>abort(Error('执行超时')),timeoutMs);
   const query=connection.query({sql:code,rowsAsArray:true});
   query.on('fields',fields=>{if(!fields)return;columns=fields.map(f=>f.name);if(columns.length>128)abort(Error('结果超过128列'));bytes=Buffer.byteLength(JSON.stringify(columns))});
   query.on('result',row=>{
    if(done)return;
    if(!Array.isArray(row)){finish(null,{affectedRows:row.affectedRows});return}
    if(rows.length>=MAX_ROWS){abort(Error('查询结果超过1000行上限'));return}
    if(row.some(cell=>Buffer.isBuffer(cell)||typeof cell==='object'&&cell!==null||typeof cell==='number'&&!Number.isFinite(cell))){abort(Error('结果仅支持文本、有限数字或NULL'));return}
    bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>MAX_BYTES){abort(Error('查询结果超过128KiB上限'));return}rows.push(row);
   });
   query.on('error',error=>finish(error));query.on('end',()=>finish(null,{columns,rows}));
  });
 }
 async oneCase(problem,code,sample,timeoutMs){
  const sql=problem.sql,db='coach_case_'+token(),user='coach_'+token(),password=token()+token();const trusted=this.admin;let connection,created=false,userCreated=false;
  try{
   if(this.cancelled)throw Error('已停止');
   await trusted.query('CREATE DATABASE '+quote(db)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');created=true;
   const tables=sql.mysqlTables||sql.tables;
   if(tables.length!==sql.tables.length)throw Error('MySQL 表结构与用例不一致');
   for(let i=0;i<tables.length;i++){
    const table=tables[i],old=sql.tables[i];if(table.name.toLowerCase()!==old.name.toLowerCase()||table.columns.length!==old.columns.length||table.columns.some((c,j)=>c.name.toLowerCase()!==old.columns[j].name.toLowerCase()))throw Error('MySQL 字段与用例顺序不一致');
    await trusted.query('CREATE TABLE '+quote(db)+'.'+quote(table.name)+' ('+table.columns.map(c=>quote(c.name)+' '+mysqlType(c.type)).join(',')+') ENGINE=InnoDB');
    const rows=sample.input[0][old.name];for(let offset=0;offset<rows.length;offset+=100){const batch=rows.slice(offset,offset+100);if(batch.length)await trusted.query('INSERT INTO '+quote(db)+'.'+quote(table.name)+' VALUES ?', [batch])}
   }
   await trusted.query('CREATE USER ?@\'127.0.0.1\' IDENTIFIED BY ?', [user,password]);userCreated=true;
   for(const table of tables)await trusted.query('GRANT SELECT ON '+quote(db)+'.'+quote(table.name)+' TO ?@\'127.0.0.1\'',[user]);
   if(sql.mode==='delete')await trusted.query('GRANT DELETE ON '+quote(db)+'.'+quote(sql.resultTable)+' TO ?@\'127.0.0.1\'',[user]);
   if(this.cancelled)throw Error('已停止');
   connection=mysql.createConnection({host:'127.0.0.1',port:this.port,user,password,database:db,connectTimeout:3000,rowsAsArray:true,dateStrings:true,decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:false,multipleStatements:false,infileStreamFactory:()=>{throw Error('不允许本地文件导入')}});
   connection.on('error',()=>{});
   await connection.promise().query('SET SESSION max_execution_time='+timeoutMs+', group_concat_max_len='+MAX_BYTES);
   let actual=await this.queryRows(connection,code,timeoutMs);
   if(sql.mode==='delete'){
    if(actual.affectedRows===undefined)throw Error('本题必须执行 DELETE 删除指定表');
    const table=tables.find(t=>t.name.toLowerCase()===sql.resultTable.toLowerCase());actual=await this.queryRows(connection,'SELECT '+table.columns.map(c=>quote(c.name)).join(',')+' FROM '+quote(table.name),timeoutMs);
   }
   if(!actual.columns?.length)throw Error('查询未返回结果表');return actual;
  }finally{
   connection?.destroy();this.queryConnection=null;this.abortQuery=null;
   if(userCreated)await trusted.query('DROP USER ?@\'127.0.0.1\'',[user]).catch(()=>{});
   if(created)await trusted.query('DROP DATABASE '+quote(db)).catch(()=>{});
  }
 }
 async run({problem,language='sql',code,cases,timeoutMs=3000}){
  if(this.running)return {status:'error',passed:0,total:0,cases:[],error:'已有MySQL测试正在运行，请先停止'};
  this.running=true;this.cancelled=false;this.processRunner.cancelled=false;const start=Date.now();
  const result={status:'error',passed:0,total:Array.isArray(cases)?cases.length:0,cases:[],durationMs:0,language:'sql',sqlDialect:'mysql',runtime:null,limits:{timeoutMs:Math.max(100,Math.min(Number(timeoutMs)||3000,30000)),memoryMb:MEMORY_MB,resultRows:MAX_ROWS,resultBytes:MAX_BYTES},isolation:ISOLATION};
  try{
   if(!['sql','mysql'].includes(language))throw Error('MySQL题目仅支持SQL语言');
   if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code)>256000)throw Error('SQL代码不能为空且必须小于256KB');
   validateSqlFixture(problem,cases);code=singleSql(code,problem.sql.mode||'query');const info=await this.detect();result.runtime=info.version;await this.start();
   for(const sample of cases){
    if(this.cancelled)break;const began=Date.now();let actual=null,error=null;
    try{actual=await this.oneCase(problem,code,sample,result.limits.timeoutMs)}catch(e){error=e.message}
    const passed=!error&&compareSql(sample.expected,actual,problem.sql.orderMatters,problem.sql.orderBy);if(passed)result.passed++;
    result.cases.push({...sample,actual,error,passed,stdout:'',stderr:'',durationMs:Date.now()-began});
   }
   result.status=this.cancelled?'cancelled':result.passed===result.total?'passed':'failed';
  }catch(error){result.error=error.message;result.status=this.cancelled?'cancelled':'error'}
  finally{this.running=false;result.durationMs=Date.now()-start}
  return result;
 }
 async disposeServer(){
  const child=this.child,exited=this.exitPromise,cwd=this.cwd;this.adminRaw?.destroy();this.admin=null;this.adminRaw=null;this.child=null;this.cwd=null;
  child?.stdin.end();if(child){await Promise.race([exited,sleep(2000)]);if(child.exitCode===null)child.kill();await Promise.race([exited,sleep(1000)])}
  if(cwd){const absolute=path.resolve(cwd);if(!absolute.startsWith(this.workRoot+path.sep))throw Error('MySQL清理路径超出私有目录');await fs.rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:200})}
 }
 close(){
  if(this.closePromise)return this.closePromise;this.closed=true;this.stop();
  this.closePromise=(async()=>{
   if(this.startPromise)await this.startPromise.catch(()=>{});
   if(this.admin)await Promise.race([this.admin.query('SHUTDOWN').catch(()=>{}),sleep(1500)]);
   await this.disposeServer();
  })();return this.closePromise;
 }
}
module.exports={MysqlRunner,mysqlType,singleSql};
