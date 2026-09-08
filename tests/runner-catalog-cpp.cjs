// Verify that every official C++17 template can be compiled and called by our adapter.
// Blank method bodies deliberately throw; this does NOT verify an algorithm solution.
const fs=require('node:fs/promises');
const path=require('node:path');
const {Runner}=require('../electron/runner.cjs');
const problems=require('../data/problems.json');
const cases=require('../data/cases.json');
const runner=new Runner({workRoot:path.join(__dirname,'../.local/runner-catalog')});
async function main(){const records=[];for(const problem of problems){
 const input=cases[problem.id];
 if(!input?.length){records.push({id:problem.id,slug:problem.slug,passed:false,error:'No verified cases available'});continue;}
 const code=problem.templates.cpp.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\{\s*\}/g,'{ throw runtime_error("ADAPTER_SIGNATURE_VERIFIED"); }');
 const r=await runner.run({problem,language:'cpp',code,cases:input});
 const passed=r.status==='failed'&&r.cases.length===input.length&&r.cases.every(c=>c.stderr.includes('ADAPTER_SIGNATURE_VERIFIED'));
 records.push({id:problem.id,slug:problem.slug,passed,cases:input.length,durationMs:r.durationMs,error:passed?undefined:r.error||r.cases.map(x=>x.stderr)});
 console.log((passed?'PASS ':'FAIL ')+problem.id+' '+problem.slug);
 }
 const result={testedAt:new Date().toISOString(),kind:'Official C++17 template compile and adapter invocation. Deliberate exceptions; not algorithm correctness.',summary:{passed:records.filter(x=>x.passed).length,total:records.length},records};
 await fs.writeFile(path.join(__dirname,'../docs/runner-cpp-catalog-results.json'),JSON.stringify(result,null,2));
 console.log(result.summary);if(records.some(x=>!x.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
