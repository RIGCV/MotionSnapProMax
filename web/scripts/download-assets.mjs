import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { MODELS } from '../src/model-config.js';

const assets = [
  {path:'models/yolo26n.onnx',url:'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.onnx',sha256:'2e947b787d9e787b93a16772a5f55b1d4d8c4d86f53146149c5d6a642442d6f7'},
  {path:'demo/bus.jpg',url:'https://raw.githubusercontent.com/ultralytics/assets/main/im/bus.jpg',sha256:'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63'},
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bundled=new URL('../public/models/'+MODELS[320].file,import.meta.url);
if(hash(await readFile(bundled))!==MODELS[320].sha256)throw new Error('Bundled 320 model failed SHA256 verification');
for(const asset of assets){
  const destination=new URL('../public/'+asset.path,import.meta.url);
  try{if(hash(await readFile(destination))===asset.sha256){console.log('Verified '+asset.path);continue;}}catch{}
  await mkdir(new URL('./',destination),{recursive:true});
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(asset.url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(hash(bytes)!==asset.sha256)throw new Error('SHA256 mismatch: upstream asset changed; verify before updating the pinned hash.');
      const temporary=new URL(destination.href+'.tmp');await writeFile(temporary,bytes);await rename(temporary,destination);
      console.log('Downloaded and verified '+asset.path);lastError=null;break;
    }catch(error){lastError=error;}
  }
  if(lastError)throw new Error(`Could not download ${asset.path}: ${lastError.message}`);
}
