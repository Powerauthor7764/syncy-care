import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function list(dir){const out=[];for(const f of await readdir(dir,{withFileTypes:true})){if(f.isDirectory())out.push(...await list(`${dir}/${f.name}`));else if(f.name.endsWith('.js'))out.push(`${dir}/${f.name}`);}return out;}
const files=[...await list('src'),...await list('public'),...await list('tests')];
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr);process.exitCode=1;}}
if(!process.exitCode) console.log(`Syntax check passed: ${files.length} JavaScript files.`);
