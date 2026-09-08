const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {Store}=require('../electron/store.cjs');
test('SQLite persists Unicode drafts per problem/language and restores version history',async()=>{
 const dir=path.resolve('.local/tests/store-'+Date.now());const a=await Store.open(dir);
 a.saveState('1',{drafts:{python:'print("你好")'},notes:'重复值需要不同下标',status:'doing'});a.saveState('1',{drafts:{cpp:'int main() {}'}});a.saveState('2',{drafts:{python:'另一题'}});a.version('1','python','旧代码','重置前');
 const b=await Store.open(dir);assert.equal(b.state('1').drafts.python,'print("你好")');assert.equal(b.state('1').drafts.cpp,'int main() {}');assert.equal(b.state('2').drafts.python,'另一题');assert.equal(b.history('1').versions[0].code,'旧代码');
});
test('Backup includes learning records, excludes account/thread/internal data, imports atomically',async()=>{
 const dir=path.resolve('.local/tests/backup-'+Date.now());const a=await Store.open(dir);a.saveState('1',{notes:'备份测试'});a.put('account','credentials',{never:'export'});a.put('thread','1',{id:'private-server-thread'});const backup=a.export();assert.equal(backup.records.account,undefined);assert.equal(backup.records.thread,undefined);const b=await Store.open(dir+'-import');b.import(backup);assert.equal(b.state('1').notes,'备份测试');
 const bad=JSON.parse('{"format":"hot100-ai-coach","version":1,"records":{"state":{"2":{"notes":"should rollback"},"__proto__":{}}}}');assert.throws(()=>b.import(bad),/非法/);assert.equal(b.get('state','2'),null);
});
test('Submission snapshot stays immutable as draft changes and chat separates problems',async()=>{
 const s=await Store.open(path.resolve('.local/tests/snapshot-'+Date.now()));const sub=s.add('submission',{problemId:'1',code:'wrong version',tests:{passed:0},review:'对应旧代码'});s.saveState('1',{drafts:{python:'new version'}});s.add('message',{problemId:'1',role:'user',text:'one'});s.add('message',{problemId:'2',role:'user',text:'two'});assert.equal(s.get('submission',sub.id).code,'wrong version');assert.equal(s.history('1').messages.length,1);assert.equal(s.history('1').messages[0].text,'one');
});
