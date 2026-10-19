import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const output=path.resolve('.sites-runtime/verification');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({type:'commonjs'}));
for(const file of ['lib/sas-model.ts','lib/sas-actions.ts','tests/sas.test.ts']){
 const target=path.join(output,file.replace(/\.ts$/,'.js'));
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
}
for(const file of ['lib/supplier-catalog.mjs','lib/supplier-workflows.mjs','lib/supplier-packages.mjs','lib/supplier-advertising.mjs'])fs.copyFileSync(file,path.join(output,file));
const result=spawnSync(process.execPath,['--test',path.join(output,'tests/sas.test.js')],{stdio:'inherit'});
process.exit(result.status??1);
