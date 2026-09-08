const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const initSqlJs=require('sql.js');
class Store {
  static async open(directory){
    fs.mkdirSync(directory,{recursive:true});const SQL=await initSqlJs({locateFile:f=>require.resolve('sql.js/dist/'+f)});
    const file=path.join(directory,'coach.sqlite');let db;
    try{db=fs.existsSync(file)?new SQL.Database(fs.readFileSync(file)):new SQL.Database()}catch(e){throw new Error('学习数据库无法读取，请保留原文件并从备份恢复：'+e.message)}
    const store=new Store(db,file);db.run('CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,key))');store.flush();return store;
  }
  constructor(db,file){this.db=db;this.file=file;}
  get(kind,key,fallback=null){const s=this.db.prepare('SELECT value FROM records WHERE kind=? AND key=?');try{s.bind([kind,String(key)]);return s.step()?JSON.parse(s.getAsObject().value):fallback}finally{s.free()}}
  all(kind){const s=this.db.prepare('SELECT key,value FROM records WHERE kind=?');const out={};try{s.bind([kind]);while(s.step()){const r=s.getAsObject();out[r.key]=JSON.parse(r.value)}return out}finally{s.free()}}
  put(kind,key,value){this.db.run('INSERT OR REPLACE INTO records(kind,key,value) VALUES(?,?,?)',[kind,String(key),JSON.stringify(value)]);this.flush();return value}
  flush(){const temp=this.file+'.tmp';const bytes=Buffer.from(this.db.export());const fd=fs.openSync(temp,'w');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,this.file)}
  state(id){return this.get('state',id,{drafts:{},notes:'',favorite:false,status:'todo',review:false})}
  saveState(id,patch){const old=this.state(id);const safe={};for(const k of ['notes','favorite','status','review','drafts'])if(Object.hasOwn(patch,k))safe[k]=patch[k];if(safe.drafts)safe.drafts={...old.drafts,...safe.drafts};return this.put('state',id,{...old,...safe})}
  history(id){return {submissions:Object.values(this.all('submission')).filter(x=>x.problemId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),messages:Object.values(this.all('message')).filter(x=>x.problemId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),versions:Object.values(this.all('version')).filter(x=>x.problemId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}}
  add(kind,value){const v={id:randomUUID(),createdAt:new Date().toISOString(),...value};return this.put(kind,v.id,v)}
  version(id,language,code,reason){return this.add('version',{problemId:id,language,code,reason})}
  export(){return {format:'hot100-ai-coach',version:1,exportedAt:new Date().toISOString(),records:Object.fromEntries(['state','submission','message','version','settings','problem','cases'].map(k=>[k,this.all(k)]))}}
  import(data){
    if(data?.format!=='hot100-ai-coach'||data.version!==1||!data.records)throw new Error('不是受支持的 Hot100 备份');
    const allowed=['state','submission','message','version','settings','problem','cases'];
    this.db.run('BEGIN');try{for(const k of allowed){for(const [id,value]of Object.entries(data.records[k]||{})){if(['__proto__','constructor','prototype'].includes(id))throw new Error('非法备份键');if(JSON.stringify(value).length>2000000)throw new Error('记录过大');this.db.run('INSERT OR REPLACE INTO records VALUES(?,?,?)',[k,id,JSON.stringify(value)])}}this.db.run('COMMIT')}catch(e){this.db.run('ROLLBACK');throw e}this.flush();
  }
}
module.exports={Store};
