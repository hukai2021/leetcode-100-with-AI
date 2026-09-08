const fs=require('node:fs');const path=require('node:path');
const roots=['node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc','node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc'];
const source=roots.find(p=>fs.existsSync(path.join(p,'bin','codex.exe')));if(!source)throw new Error('缺少官方 Codex Windows x64 二进制，请 npm ci');
fs.mkdirSync('runtime/codex',{recursive:true});fs.cpSync(path.join(source,'bin'),'runtime/codex',{recursive:true});
for(const dir of ['codex-resources','codex-path'])if(fs.existsSync(path.join(source,dir)))fs.cpSync(path.join(source,dir),path.join('runtime',dir),{recursive:true});
for(const f of ['LICENSE','README.md']){const p=path.join('node_modules/@openai/codex',f);if(fs.existsSync(p))fs.copyFileSync(p,path.join('runtime/codex',f))}
console.log('官方 Codex 运行依赖已备妥');
