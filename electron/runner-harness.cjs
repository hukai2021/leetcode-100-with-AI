'use strict';
function metaOf(p){let m=p.meta||p.metaData;if(typeof m==='string')m=JSON.parse(m);if(!m||(!m.name&&!m.classname&&!m.className))throw Error('题目缺少官方方法签名 meta，无法生成运行适配器');return m;}
const slugOf=p=>p.slug||p.titleSlug;
const pyPrelude=String.raw`from __future__ import annotations
import sys, json, os, traceback, math, collections, itertools, functools, heapq, bisect, random, string
from typing import *
from collections import *
from functools import *
from heapq import *
from bisect import *
from math import *
class ListNode:
    def __init__(self,val=0,next=None): self.val,self.next=val,next
class TreeNode:
    def __init__(self,val=0,left=None,right=None): self.val,self.left,self.right=val,left,right
class Node:
    def __init__(self,val=0,next=None,random=None): self.val,self.next,self.random=val,next,random
def _list(a):
    dummy=ListNode(); tail=dummy
    for x in a or []: tail.next=ListNode(x); tail=tail.next
    return dummy.next
def _nodes(head):
    result=[]; seen=set()
    while head is not None:
        if id(head) in seen: raise ValueError('输出链表含环')
        if len(result)>100000: raise ValueError('输出链表超过 100000 个节点')
        result.append(head); seen.add(id(head)); head=head.next
    return result
def _tree(a):
    if not a or a[0] is None: return None
    root=TreeNode(a[0]); q=deque([root]); i=1
    while q and i<len(a):
        cur=q.popleft()
        for k in ('left','right'):
            if i<len(a) and a[i] is not None: child=TreeNode(a[i]);setattr(cur,k,child);q.append(child)
            i+=1
    return root
def _find(root,val):
    if root is None: return None
    if root.val==val: return root
    return _find(root.left,val) or _find(root.right,val)
def _convert(a,t):
    if t=='ListNode': return _list(a)
    if t=='TreeNode': return _tree(a)
    if t in ('Node','RandomListNode'):
        nodes=[Node(x[0]) for x in a]
        for i,x in enumerate(a):
            nodes[i].next=nodes[i+1] if i+1<len(nodes) else None
            nodes[i].random=nodes[x[1]] if x[1] is not None else None
        return nodes[0] if nodes else None
    if t.endswith('[]'): return [_convert(x,t[:-2]) for x in a]
    if t.startswith('list<'): return [_convert(x,t[5:-1]) for x in a]
    return a
def _serialize(x):
    if isinstance(x,Node):
        nodes=_nodes(x); ids={id(n):i for i,n in enumerate(nodes)}
        return [[n.val,ids[id(n.random)] if n.random else None] for n in nodes]
    if isinstance(x,ListNode): return [n.val for n in _nodes(x)]
    if isinstance(x,TreeNode):
        result=[];q=deque([x]);seen=set()
        while q:
            n=q.popleft()
            if n is None: result.append(None);continue
            if id(n) in seen: raise ValueError('输出树含环或节点被多个父节点共享')
            if len(seen)>100000: raise ValueError('输出树超过 100000 个节点')
            seen.add(id(n));result.append(n.val);q.extend([n.left,n.right])
        while result and result[-1] is None:result.pop()
        return result
    if isinstance(x,(list,tuple,deque,set)): return [_serialize(a) for a in x]
    if isinstance(x,dict): return {k:_serialize(v) for k,v in x.items()}
    return x
`;
function pythonHarness(p,code,token){
 const m=metaOf(p),slug=slugOf(p);const design=m.systemdesign||m.classname||m.className;
 const driver=String.raw`
_meta=json.loads(${JSON.stringify(JSON.stringify(m))})
_slug=${JSON.stringify(slug)}
with open(os.path.join(os.path.dirname(__file__),'cases.json'),encoding='utf-8') as _f: _case=json.load(_f)[int(sys.argv[1])]
_raw=_case['input']
if ${design?'True':'False'}:
    _ops,_values=_raw
    _class=globals()[_meta.get('classname') or _meta.get('className') or _meta.get('name')]
    _obj=_class(*_values[0]);_result=[None]
    for _op,_values1 in zip(_ops[1:],_values[1:]): _result.append(getattr(_obj,_op)(*_values1))
else:
    _params=_meta.get('params',[])
    _args=[] if _slug in ('intersection-of-two-linked-lists','lowest-common-ancestor-of-a-binary-tree','copy-list-with-random-pointer') else [_convert(a,p['type']) for a,p in zip(_raw,_params)]
    if _slug in ('linked-list-cycle','linked-list-cycle-ii'):
        _args=[_list(_raw[0])];_ns=_nodes(_args[0]);_pos=_raw[1] if len(_raw)>1 else -1
        if _pos>=0: _ns[-1].next=_ns[_pos]
    elif _slug=='intersection-of-two-linked-lists':
        if len(_raw)!=5: raise ValueError('相交链表输入格式为 [intersectVal,listA,listB,skipA,skipB]')
        _iv,_a,_b,_sa,_sb=_raw;_ha=_list(_a);_hb=_list(_b);_na=_nodes(_ha);_nb=_nodes(_hb)
        if _iv:
            if _sb: _nb[_sb-1].next=_na[_sa]
            else: _hb=_na[_sa]
        _args=[_ha,_hb]
    elif _slug=='lowest-common-ancestor-of-a-binary-tree':
        _root=_tree(_raw[0]);_args=[_root,_find(_root,_raw[1]),_find(_root,_raw[2])]
    elif _slug=='copy-list-with-random-pointer':
        _args=[_convert(_raw[0],'Node')];_original=set(_nodes(_args[0]))
    _result=getattr(Solution(),_meta['name'])(*_args)
    if _slug=='copy-list-with-random-pointer' and any(n in _original for n in _nodes(_result)): raise ValueError('深拷贝结果不能复用原链表节点')
    if _slug=='intersection-of-two-linked-lists' and _result is not (_na[_sa] if _iv else None): raise ValueError('必须返回两条链表共享的首个交点节点，不能新建同值节点')
    if _slug=='lowest-common-ancestor-of-a-binary-tree' and _result is not None and _find(_root,_result.val) is not _result: raise ValueError('必须返回原树节点，不能新建同值节点')
    if _slug in ('lowest-common-ancestor-of-a-binary-tree','intersection-of-two-linked-lists'): _result=_result.val if _result else None
    elif _slug=='linked-list-cycle-ii': _result=_ns.index(_result) if _result else -1
    elif _meta.get('return',{}).get('type')=='void': _result=_args[0] if _args[0] is not None else []
    elif _result is None and _meta.get('return',{}).get('type') in ('ListNode','TreeNode','Node'): _result=[]
print('\n__HOT100_${token}__'+json.dumps(_serialize(_result),ensure_ascii=False,separators=(',',':'),allow_nan=False))
`;
 return pyPrelude+'\n# User submission\n'+code+'\n# Judge adapter\n'+driver;
}
const cppPrelude=String.raw`#include <bits/stdc++.h>
using namespace std;
struct ListNode {int val;ListNode*next;ListNode():val(0),next(nullptr){}ListNode(int x):val(x),next(nullptr){}ListNode(int x,ListNode*n):val(x),next(n){}};
struct TreeNode {int val;TreeNode*left;TreeNode*right;TreeNode():val(0),left(nullptr),right(nullptr){}TreeNode(int x):val(x),left(nullptr),right(nullptr){}TreeNode(int x,TreeNode*l,TreeNode*r):val(x),left(l),right(r){}};
class Node {public:int val;Node*next;Node*random;Node(int x):val(x),next(nullptr),random(nullptr){}};
ListNode* makeList(vector<int>a){ListNode*d=new ListNode();auto*t=d;for(int x:a){t->next=new ListNode(x);t=t->next;}return d->next;}
vector<ListNode*> listNodes(ListNode*h){vector<ListNode*>a;unordered_set<ListNode*>seen;while(h){if(!seen.insert(h).second||a.size()>100000)throw runtime_error("output list cycle/limit");a.push_back(h);h=h->next;}return a;}
TreeNode* makeTree(vector<optional<int>>a){if(a.empty()||!a[0])return nullptr;auto*r=new TreeNode(*a[0]);queue<TreeNode*>q;q.push(r);size_t i=1;while(!q.empty()&&i<a.size()){auto*n=q.front();q.pop();if(i<a.size()&&a[i]){n->left=new TreeNode(*a[i]);q.push(n->left);}i++;if(i<a.size()&&a[i]){n->right=new TreeNode(*a[i]);q.push(n->right);}i++;}return r;}
TreeNode* findTree(TreeNode*r,int v){if(!r||r->val==v)return r;auto*l=findTree(r->left,v);return l?l:findTree(r->right,v);}
Node* makeRandom(vector<pair<int,optional<int>>>a){vector<Node*>ns;for(auto&x:a)ns.push_back(new Node(x.first));for(size_t i=0;i<a.size();i++){ns[i]->next=i+1<a.size()?ns[i+1]:nullptr;ns[i]->random=a[i].second?ns.at(*a[i].second):nullptr;}return ns.empty()?nullptr:ns[0];}
string dump(const string&v){string r="\"";for(unsigned char c:v){switch(c){case '"':r+="\\\"";break;case '\\':r+="\\\\";break;case '\n':r+="\\n";break;case '\r':r+="\\r";break;case '\t':r+="\\t";break;default:if(c<32){char b[7];snprintf(b,7,"\\u%04x",c);r+=b;}else r+=c;}}return r+"\"";}
string dump(char c){return dump(string(1,c));}string dump(bool v){return v?"true":"false";}string dump(nullptr_t){return "null";}
template<class T,enable_if_t<is_arithmetic_v<T>&&!is_same_v<T,bool>&&!is_same_v<T,char>,int> =0>string dump(T v){ostringstream s;s<<setprecision(17)<<v;return s.str();}
template<class T>string dump(const vector<T>&a);
string dump(ListNode*h){vector<int>a;for(auto*n:listNodes(h))a.push_back(n->val);return dump(a);}
string dump(TreeNode*r){if(!r)return "[]";queue<TreeNode*>q;q.push(r);unordered_set<TreeNode*>seen;vector<string>a;while(!q.empty()){auto*n=q.front();q.pop();if(!n){a.push_back("null");continue;}if(!seen.insert(n).second||a.size()>200000)throw runtime_error("output tree cycle/limit");a.push_back(to_string(n->val));q.push(n->left);q.push(n->right);}while(!a.empty()&&a.back()=="null")a.pop_back();string s="[";for(auto&v:a){if(s.size()>1)s+=",";s+=v;}return s+"]";}
string dump(Node*h){vector<Node*>ns;unordered_map<Node*,int>idx;while(h){if(idx.count(h)||ns.size()>100000)throw runtime_error("random list cycle/limit");idx[h]=ns.size();ns.push_back(h);h=h->next;}string s="[";for(auto*n:ns){if(s.size()>1)s+=",";s+="["+to_string(n->val)+","+(n->random?to_string(idx.at(n->random)):"null")+"]";}return s+"]";}
template<class T>string dump(const vector<T>&a){string s="[";for(size_t i=0;i<a.size();i++){if(i)s+=",";s+=dump(static_cast<T>(a[i]));if(s.size()>262144)throw runtime_error("output limit");}return s+"]";}
`;
function cppType(t){if(t?.endsWith('[]'))return `vector<${cppType(t.slice(0,-2))}>`;if(t?.startsWith('list<'))return `vector<${cppType(t.slice(5,-1))}>`;const map={integer:'int',long:'long long','long long':'long long',double:'double',float:'double',boolean:'bool',bool:'bool',string:'string',character:'char',char:'char',ListNode:'ListNode*',TreeNode:'TreeNode*',Node:'Node*',RandomListNode:'Node*',void:'void'};if(map[t])return map[t];throw Error('尚不支持的 C++ 参数类型：'+t);}
function literal(a,t){
 if(t==='ListNode')return `makeList(${literal(a||[],'integer[]')})`;
 if(t==='TreeNode')return `makeTree(vector<optional<int>>{${(a||[]).map(v=>v===null?'nullopt':String(v)).join(',')}})`;
 if(t==='Node'||t==='RandomListNode')return `makeRandom(vector<pair<int,optional<int>>>{${(a||[]).map(v=>`{${v[0]},${v[1]===null?'nullopt':v[1]}}`).join(',')}})`;
 if(t?.endsWith('[]'))return `${cppType(t)}{${a.map(v=>literal(v,t.slice(0,-2))).join(',')}}`;
 if(t?.startsWith('list<'))return `${cppType(t)}{${a.map(v=>literal(v,t.slice(5,-1))).join(',')}}`;
 if(t==='string')return `string(${JSON.stringify(a)})`;
 if(t==='character'||t==='char')return `char(${String(a).charCodeAt(0)})`;
 if(t==='boolean'||t==='bool')return a?'true':'false';
 if(typeof a==='number'&&Number.isFinite(a))return String(a)+(t==='long'?'LL':'');
 throw Error('C++ 用例与参数类型不匹配：'+t);
}
function cppHarness(p,code,cases,token){
 const m=metaOf(p),slug=slugOf(p),design=m.systemdesign||m.classname||m.className;
 const blocks=cases.map((c,i)=>{
  let body='';const raw=c.input;
  if(design){
   const cls=m.classname||m.className||m.name,constructor=m.constructor||{},methods=m.methods||[];
   const ops=raw[0],values=raw[1];const ctorParams=constructor.params||[];
   body+=`${cls} obj(${values[0].map((v,n)=>literal(v,ctorParams[n]?.type||'integer')).join(',')});\n`;
   if(!values[0].length)body=body.replace(`${cls} obj();`,`${cls} obj;`);
   body+='string result="[null";\n';
   for(let n=1;n<ops.length;n++){const method=methods.find(x=>x.name===ops[n]);if(!method)throw Error('设计题缺少方法签名：'+ops[n]);const args=values[n].map((v,k)=>literal(v,method.params[k].type)).join(',');const call=`obj.${ops[n]}(${args})`;body+=(method.return?.type||method.returnType)==='void'?`${call};result+=",null";\n`:`result+=","+dump(${call});\n`;}
   body+='result+="]";';
  }else{
   const params=m.params||[];
   if(slug==='intersection-of-two-linked-lists'){
    if(raw.length!==5)throw Error('相交链表 input 需要 [intersectVal,listA,listB,skipA,skipB]');
    body+=`auto a0=${literal(raw[1],'ListNode')};auto a1=${literal(raw[2],'ListNode')};auto na=listNodes(a0);auto nb=listNodes(a1);`;
    if(raw[0])body+=raw[4]?`nb.at(${raw[4]-1})->next=na.at(${raw[3]});`:`a1=na.at(${raw[3]});`;
   }else if(slug==='lowest-common-ancestor-of-a-binary-tree')body+=`auto a0=${literal(raw[0],'TreeNode')};auto a1=findTree(a0,${raw[1]});auto a2=findTree(a0,${raw[2]});`;
   else if(slug==='copy-list-with-random-pointer')body+=`auto a0=${literal(raw[0],'Node')};unordered_set<Node*>original;for(auto*n=a0;n;n=n->next)original.insert(n);`;
   else{body+=params.map((a,n)=>`${cppType(a.type)} a${n}=${literal(raw[n],a.type)};`).join('\n');if(['linked-list-cycle','linked-list-cycle-ii'].includes(slug)){body+='auto ns=listNodes(a0);';if(raw[1]>=0)body+=`ns.back()->next=ns.at(${raw[1]});`;}}
   let call=`Solution().${m.name}(${params.map((_,n)=>'a'+n).join(',')})`;
   if(slug==='intersection-of-two-linked-lists')call=`Solution().${m.name}(a0,a1)`;
   if(['linked-list-cycle','linked-list-cycle-ii'].includes(slug))call=`Solution().${m.name}(a0)`;
   if(m.return?.type==='void')body+=`${call};string result=dump(a0);`;
   else if(slug==='intersection-of-two-linked-lists')body+=`auto out=${call};if(out!=${raw[0]?`na.at(${raw[3]})`:'nullptr'})throw runtime_error("must return shared intersection node");string result=out?dump(out->val):"null";`;
   else if(slug==='lowest-common-ancestor-of-a-binary-tree')body+=`auto out=${call};if(out&&findTree(a0,out->val)!=out)throw runtime_error("must return original tree node");string result=out?dump(out->val):"null";`;
   else if(slug==='copy-list-with-random-pointer')body+=`auto out=${call};unordered_set<Node*>seenCopy;for(auto*n=out;n;n=n->next){if(original.count(n))throw runtime_error("deep copy must not reuse original nodes");if(!seenCopy.insert(n).second)throw runtime_error("output list cycle");}string result=dump(out);`;
   else if(slug==='linked-list-cycle-ii')body+=`auto out=${call};int idx=-1;for(int n=0;n<(int)ns.size();n++)if(ns[n]==out)idx=n;string result=dump(idx);`;
   else body+=`auto out=${call};string result=dump(out);`;
  }
  return `if(index==${i}){${body}\ncout<<"\\n__HOT100_${token}__"<<result<<endl;return 0;}`;
 }).join('\n');
 return cppPrelude+'\n// User submission\n'+code+'\n// Judge adapter\nint main(int argc,char**argv){try{int index=argc>1?stoi(argv[1]):0;\n'+blocks+'\nreturn 2;}catch(const exception&e){cerr<<e.what()<<endl;return 1;}}\n';
}
module.exports={pythonHarness,cppHarness,metaOf,cppType};
