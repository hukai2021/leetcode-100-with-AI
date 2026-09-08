const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Runner}=require('../electron/runner.cjs');
async function main(){const r=new Runner({workRoot:path.join(__dirname,'../.local/format-tests')});const results=[];
for(const language of ['python','cpp']){const code=language==='python'?'# 保留注释\nclass Solution:\n def twoSum(self,nums,target):\n  return [0,1]\n':'// 保留注释\nclass Solution{public:vector<int>twoSum(vector<int>&nums,int target){return {0,1};}};';const output=await r.format({language,code});assert.notEqual(output.code,code);assert(output.code.includes('保留注释'));const p=require('../data/problems.json').find(p=>p.id==='1');const test=await r.run({problem:p,language,code:output.code,cases:[{input:[[2,7],9],expected:[0,1]}]});assert.equal(test.status,'passed',JSON.stringify(test));results.push({language,formatter:output.formatter,formatted:output.code,executionPassed:true});console.log('PASS '+language+' formatting + real execution');}
await fs.writeFile(path.join(__dirname,'../docs/runner-format-results.json'),JSON.stringify({testedAt:new Date().toISOString(),results},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
