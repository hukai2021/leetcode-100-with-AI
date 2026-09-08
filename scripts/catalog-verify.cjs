'use strict';
// Real Python subprocess verification of locally authored reference algorithms
// against cached official examples. This never calls LeetCode's online judge.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Runner} = require('../electron/runner.cjs');
const root=path.join(__dirname,'..');
const problems=require('../data/problems.json');
const allCases=require('../data/cases.json');
const references=require('../docs/catalog-reference-sources.json');
const filter=process.argv.slice(2);
const queue=problems.filter(p=>!filter.length||filter.includes(p.id));
const selected=queue.slice();
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const startedAt=new Date().toISOString();
const records=[];
async function worker(index){
 const runner=new Runner({workRoot:path.join(root,'.local','catalog-validation-'+index)});
 while(queue.length){
  const problem=queue.shift();
  const result=await runner.run({problem,language:'python',code:references[problem.id],cases:allCases[problem.id],timeoutMs:3000});
  records.push({id:problem.id,title:problem.title,slug:problem.slug,referenceSource:'scripts/catalog-reference-solutions.py',...result});
  console.log(`${result.status==='passed'?'PASS':'FAIL'} ${problem.id} ${problem.slug} ${result.passed}/${result.total}${result.error?' '+result.error:''}`);
  if(result.status!=='passed') for(const c of result.cases.filter(c=>!c.passed)) console.log(JSON.stringify({input:c.input,expected:c.expected,actual:c.actual,error:c.error,stderr:c.stderr}));
 }
}
async function main(){
 await Promise.all([0,1,2].map(worker));
 records.sort((a,b)=>selected.findIndex(p=>p.id===a.id)-selected.findIndex(p=>p.id===b.id));
 const report={startedAt,completedAt:new Date().toISOString(),language:'python',
  source:'Locally authored reference algorithms executed by the application Runner against the official public examples; not official judge results.',
  codeHashes:Object.fromEntries(['data/problems.json','data/cases.json','electron/runner.cjs','electron/runner-harness.cjs','scripts/catalog-reference-solutions.py','docs/catalog-reference-sources.json'].map(f=>[f,hash(f)])),
  totalProblems:records.length,passedProblems:records.filter(r=>r.status==='passed').length,
  totalCases:records.reduce((n,r)=>n+r.total,0),passedCases:records.reduce((n,r)=>n+r.passed,0),
  failedIds:records.filter(r=>r.status!=='passed').map(r=>r.id),records};
 const destination=filter.length?'docs/catalog-validation-partial.json':'docs/catalog-validation.json';
 fs.writeFileSync(path.join(root,destination),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({totalProblems:report.totalProblems,passedProblems:report.passedProblems,totalCases:report.totalCases,passedCases:report.passedCases,failedIds:report.failedIds,report:destination}));
 process.exitCode=report.failedIds.length?1:0;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
