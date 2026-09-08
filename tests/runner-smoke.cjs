// Real execution tests; no simulated subprocesses and no AI calls.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Runner,compare}=require('../electron/runner.cjs');
const runner=new Runner({workRoot:path.join(__dirname,'../.local/runner-tests')});
const records=[];
function problem(slug,name,types,ret){return require('../data/problems.json').find(p=>p.slug===slug)||{slug,meta:{name,params:types.map((type,i)=>({name:'p'+i,type})),return:{type:ret}}};}
const two=problem('two-sum','twoSum',['integer[]','integer'],'integer[]');
async function test(name,fn){const start=Date.now();try{const detail=await fn();records.push({name,passed:true,durationMs:Date.now()-start,detail});console.log('PASS '+name);}catch(e){records.push({name,passed:false,durationMs:Date.now()-start,error:e.stack});console.error('FAIL '+name+' '+e.message);}}
async function runPass(p,language,code,cases){const r=await runner.run({problem:p,language,code,cases});assert.equal(r.status,'passed',JSON.stringify(r));return {passed:r.passed,total:r.total,durationMs:r.durationMs};}
async function main(){
const env=await runner.detect();console.log(env);
for(const language of ['python','cpp']){
 await test(language+' two-sum: normal, duplicate, negative, alternate order',()=>runPass(two,language,language==='python'?`class Solution:
 def twoSum(self,nums,target):
  seen={}
  for i,v in enumerate(nums):
   if target-v in seen:return [i,seen[target-v]]
   seen[v]=i`:`class Solution {public:vector<int> twoSum(vector<int>&a,int t){unordered_map<int,int>s;for(int i=0;i<(int)a.size();i++){if(s.count(t-a[i]))return {i,s[t-a[i]]};s[a[i]]=i;}return {};}};`,[
 {input:[[2,7,11,15],9],expected:[0,1]}, {input:[[3,3],6],expected:[0,1]}, {input:[[-3,0,3],0],expected:[0,2]}, {input:[[3,2,4],6],expected:[1,2]}
 ]));
 await test(language+' reverse linked list: list and empty',()=>runPass(problem('reverse-linked-list','reverseList',['ListNode'],'ListNode'),language,language==='python'?`class Solution:
 def reverseList(self,head):
  prev=None
  while head: head.next,prev,head=prev,head,head.next
  return prev`:`class Solution{public:ListNode* reverseList(ListNode*h){ListNode*p=nullptr;while(h){auto*n=h->next;h->next=p;p=h;h=n;}return p;}};`,[{input:[[1,2,3]],expected:[3,2,1]},{input:[[]],expected:[]}]))
 await test(language+' tree serialize and in-place flatten',()=>runPass(problem('flatten-binary-tree-to-linked-list','flatten',['TreeNode'],'void'),language,language==='python'?`class Solution:
 def flatten(self,root):
  if not root:return
  self.flatten(root.left);self.flatten(root.right)
  tail=root.left
  if tail:
   while tail.right:tail=tail.right
   tail.right=root.right;root.right=root.left;root.left=None`:`class Solution{public:void flatten(TreeNode*r){if(!r)return;flatten(r->left);flatten(r->right);if(r->left){auto*t=r->left;while(t->right)t=t->right;t->right=r->right;r->right=r->left;r->left=nullptr;}}};`,[{input:[[1,2,5,3,4,null,6]],expected:[1,null,2,null,3,null,4,null,5,null,6]},{input:[[]],expected:[]}]))
 await test(language+' in-place array mutation',()=>runPass(problem('move-zeroes','moveZeroes',['integer[]'],'void'),language,language==='python'?`class Solution:
 def moveZeroes(self,nums):
  vals=[x for x in nums if x];nums[:]=vals+[0]*(len(nums)-len(vals))`:`class Solution{public:void moveZeroes(vector<int>&a){int j=0;for(int v:a)if(v)a[j++]=v;while(j<(int)a.size())a[j++]=0;}};`,[{input:[[0,1,0,3,12]],expected:[1,3,12,0,0]}]))
 await test(language+' cycle entry identity',()=>runPass(problem('linked-list-cycle-ii','detectCycle',['ListNode'],'ListNode'),language,language==='python'?`class Solution:
 def detectCycle(self,head):
  seen=set()
  while head:
   if head in seen:return head
   seen.add(head);head=head.next
  return None`:`class Solution{public:ListNode*detectCycle(ListNode*h){unordered_set<ListNode*>s;while(h){if(s.count(h))return h;s.insert(h);h=h->next;}return nullptr;}};`,[{input:[[3,2,0,-4],1],expected:1},{input:[[1],-1],expected:-1}]))
 await test(language+' shared intersection identity',()=>runPass(problem('intersection-of-two-linked-lists','getIntersectionNode',['ListNode','ListNode'],'ListNode'),language,language==='python'?`class Solution:
 def getIntersectionNode(self,a,b):
  s=set()
  while a:s.add(a);a=a.next
  while b:
   if b in s:return b
   b=b.next
  return None`:`class Solution{public:ListNode*getIntersectionNode(ListNode*a,ListNode*b){unordered_set<ListNode*>s;while(a){s.insert(a);a=a->next;}while(b){if(s.count(b))return b;b=b->next;}return nullptr;}};`,[{input:[8,[4,1,8,4,5],[5,6,1,8,4,5],2,3],expected:8},{input:[0,[1],[1],1,1],expected:null}]))
 await test(language+' LCA node references',()=>runPass(problem('lowest-common-ancestor-of-a-binary-tree','lowestCommonAncestor',['TreeNode','TreeNode','TreeNode'],'TreeNode'),language,language==='python'?`class Solution:
 def lowestCommonAncestor(self,r,p,q):
  if r is None or r is p or r is q:return r
  a=self.lowestCommonAncestor(r.left,p,q);b=self.lowestCommonAncestor(r.right,p,q)
  return r if a and b else a or b`:`class Solution{public:TreeNode*lowestCommonAncestor(TreeNode*r,TreeNode*p,TreeNode*q){if(!r||r==p||r==q)return r;auto*a=lowestCommonAncestor(r->left,p,q);auto*b=lowestCommonAncestor(r->right,p,q);return a&&b?r:a?a:b;}};`,[{input:[[3,5,1,6,2,0,8,null,null,7,4],5,1],expected:3}]))
 await test(language+' random pointer list',()=>runPass(problem('copy-list-with-random-pointer','copyRandomList',['Node'],'Node'),language,language==='python'?`class Solution:
 def copyRandomList(self,head):
  d={None:None};p=head
  while p:d[p]=Node(p.val);p=p.next
  p=head
  while p:d[p].next=d[p.next];d[p].random=d[p.random];p=p.next
  return d[head]`:`class Solution{public:Node*copyRandomList(Node*h){unordered_map<Node*,Node*>m;m[nullptr]=nullptr;for(auto*p=h;p;p=p->next)m[p]=new Node(p->val);for(auto*p=h;p;p=p->next){m[p]->next=m[p->next];m[p]->random=m[p->random];}return m[h];}};`,[{input:[[[7,null],[13,0],[11,1]]],expected:[[7,null],[13,0],[11,1]]},{input:[[]],expected:[]}]))
 const stack={slug:'min-stack',meta:{classname:'MinStack',systemdesign:true,constructor:{params:[]},methods:[{name:'push',params:[{name:'val',type:'integer'}],return:{type:'void'}},{name:'pop',params:[],return:{type:'void'}},{name:'top',params:[],return:{type:'integer'}},{name:'getMin',params:[],return:{type:'integer'}}]}};
 await test(language+' design MinStack',()=>runPass(stack,language,language==='python'?`class MinStack:
 def __init__(self):self.a=[]
 def push(self,x):self.a.append(x)
 def pop(self):self.a.pop()
 def top(self):return self.a[-1]
 def getMin(self):return min(self.a)`:`class MinStack{vector<int>a;public:void push(int x){a.push_back(x);}void pop(){a.pop_back();}int top(){return a.back();}int getMin(){return *min_element(a.begin(),a.end());}};`,[{input:[['MinStack','push','push','push','getMin','pop','top','getMin'],[[],[-2],[0],[-3],[],[],[],[]]],expected:[null,null,null,null,-3,null,0,-2]}]))
 await test(language+' rejects incorrect answer',async()=>{const r=await runner.run({problem:two,language,code:language==='python'?'class Solution:\n def twoSum(self,a,t):return [0,0]':'class Solution{public:vector<int>twoSum(vector<int>&a,int t){return {0,0};}};',cases:[{input:[[2,7],9],expected:[0,1]}]});assert.equal(r.status,'failed');return r.cases[0];});
}
await test('comparator unordered nested + alternate longest palindrome',()=>{
 assert(compare({slug:'3sum'},[],[[-1,-1,2],[-1,0,1]],[[1,-1,0],[2,-1,-1]]));
 assert(!compare({slug:'permutations'},[],[[1,2],[2,1]],[[1,2],[1,2]]));
 assert(compare({slug:'longest-palindromic-substring'},['babad'],'bab','aba'));
 assert(!compare({slug:'longest-palindromic-substring'},['babad'],'bab','bad'));
 assert(compare({slug:'top-k-frequent-elements'},[[1,1,2,2,3],1],[1],[2]));
 assert(compare({slug:'convert-sorted-array-to-binary-search-tree'},[[-10,-3,0,5,9]],[0,-3,9,-10,null,5],[0,-10,5,null,-3,null,9]));
 assert(!compare({slug:'convert-sorted-array-to-binary-search-tree'},[[1,2,3]],[2,1,3],[1,null,2,null,3]));
 assert(!compare({slug:'convert-sorted-array-to-binary-search-tree'},[[1,2,3]],[2,1,3],[2,3,1]));
 assert(compare({slug:'palindrome-partitioning'},['aab'],[['a','a','b'],['aa','b']],[['aa','b'],['a','a','b']]));
 assert(!compare({slug:'palindrome-partitioning'},['aab'],[['aa','b']],[['b','aa']]));
 return '10 assertions';
});
const runPython=(code,timeoutMs=3000)=>runner.run({problem:two,language:'python',code,cases:[{input:[[2,7],9],expected:[0,1]}],timeoutMs});
await test('Python timeout enforced',async()=>{const r=await runPython('class Solution:\n def twoSum(self,a,t):\n  while True:pass',200);assert.match(r.cases[0].error,/超时/);return r.cases[0].error;});
await test('Python stdout limit enforced',async()=>{const r=await runPython('class Solution:\n def twoSum(self,a,t):\n  print("x"*300000)\n  return [0,1]');assert.match(r.cases[0].error,/输出/);return r.cases[0].error;});
await test('Python memory limit enforced',async()=>{const r=await runPython('class Solution:\n def twoSum(self,a,t):\n  x=bytearray(400*1024*1024)\n  return [0,1]');assert.equal(r.status,'failed');assert.match(r.cases[0].stderr,/MemoryError/);return r.cases[0].stderr;});
await test('Python minimal env excludes credentials',async()=>{const r=await runPython('class Solution:\n def twoSum(self,a,t):\n  assert not any(k in os.environ for k in ("OPENAI_API_KEY","CODEX_HOME","ANTHROPIC_API_KEY"))\n  return [0,1]');assert.equal(r.status,'passed');return 'No credential environment variables inherited';});
await test('Stop cancels live task',async()=>{const pending=runPython('class Solution:\n def twoSum(self,a,t):\n  while True:pass',15000);const timer=setTimeout(()=>runner.stop(),800);const r=await pending;clearTimeout(timer);assert.equal(r.status,'cancelled');assert(r.durationMs<5000);return {status:r.status,durationMs:r.durationMs};});
await test('Job Object reaps descendant process after completion',async()=>{const r=await runPython('import subprocess\nclass Solution:\n def twoSum(self,a,t):\n  p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"])\n  print(p.pid,flush=True)\n  return [0,1]');assert.equal(r.status,'passed');const pid=Number(r.cases[0].stdout.trim());assert(pid>0);await new Promise(resolve=>setTimeout(resolve,150));let alive=false;try{process.kill(pid,0);alive=true}catch{}assert.equal(alive,false);return {descendantPid:pid,reaped:true};});
for(const language of ['python','cpp'])await test(language+' deep-copy identity violation rejected',async()=>{const r=await runner.run({problem:problem('copy-list-with-random-pointer'),language,code:language==='python'?'class Solution:\n def copyRandomList(self,h):return h':'class Solution{public:Node*copyRandomList(Node*h){return h;}};',cases:[{input:[[[7,null]]],expected:[[7,null]]}]});assert.equal(r.status,'failed');assert.match(r.cases[0].stderr,/深拷贝|deep copy/);return r.cases[0].stderr.slice(-300);});
await test('C++ vector bounds assertion captured',async()=>{const r=await runner.run({problem:two,language:'cpp',code:'class Solution{public:vector<int>twoSum(vector<int>&a,int t){return {a[100000],0};}};',cases:[{input:[[2,7],9],expected:[0,1]}]});assert.equal(r.status,'failed');assert(r.cases[0].error);return {error:r.cases[0].error,stderr:r.cases[0].stderr.slice(-500)};});
await test('C++ compiler errors captured',async()=>{const r=await runner.run({problem:two,language:'cpp',code:'class Solution { broken };',cases:[{input:[[2,7],9],expected:[0,1]}]});assert.equal(r.status,'error');assert.match(r.error,/编译失败/);return r.error.slice(0,300);});
await test('Custom case missing expected rejected',async()=>{const r=await runner.run({problem:two,language:'python',code:'',cases:[{input:[[2,7],9]}]});assert.equal(r.status,'error');assert.match(r.error,/expected/);return r.error;});
await fs.mkdir(path.join(__dirname,'../docs'),{recursive:true});await fs.writeFile(path.join(__dirname,'../docs/runner-test-results.json'),JSON.stringify({testedAt:new Date().toISOString(),platform:process.platform,environment:env,summary:{passed:records.filter(x=>x.passed).length,total:records.length},records},null,2));
console.log(records.filter(x=>x.passed).length+'/'+records.length+' passed');if(records.some(x=>!x.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
