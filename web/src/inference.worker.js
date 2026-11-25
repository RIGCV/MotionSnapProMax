import * as ort from 'onnxruntime-web/webgpu';
import { letterbox, decodeDetections } from './detection.js';
import { Tracker } from './tracker.js';
import { MODELS } from './model-config.js';

const tracker = new Tracker();
let session, backend, drawing, context, trackingRevision;
let SIZE=320;
async function modelBytes(url,model) {
  const key=`${url}?sha256=${model.sha256}`;
  let cache, response;
  try { cache=await caches.open('motionsnap-model-v1'); response=await cache.match(key); } catch { /* Private mode may disallow storage. */ }
  if(response) {
    const buffer=await response.arrayBuffer();
    if(await validHash(buffer,model.sha256)) {self.postMessage({type:'progress',progress:100,text:'已读取本地缓存模型'});return buffer;}
    await cache.delete(key);
  }
  response=await fetch(url);
  if(!response.ok) throw new Error(`模型下载失败（HTTP ${response.status}），请检查网络或重新加载页面。`);
  const total=Number(response.headers.get('Content-Length')) || model.bytes;
  const reader=response.body.getReader(); const chunks=[];let received=0;
  while(true) {
    const {done,value}=await reader.read();if(done) break;
    chunks.push(value);received+=value.length;
    self.postMessage({type:'progress',progress:Math.min(99,Math.round(received/total*100)),text:`下载模型 ${(received/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`});
  }
  const bytes=new Uint8Array(received);let offset=0;
  for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  if(!await validHash(bytes.buffer,model.sha256)) throw new Error('模型文件校验失败，请重新加载后重试。');
  try {await cache?.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* Storage full: inference still works. */}
  return bytes.buffer;
}
async function validHash(buffer,expected) {
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')===expected;
}
async function initialize({baseURL,preferred,size=320}) {
  const model=MODELS[size];if(!model)throw new Error('不支持的模型尺寸');SIZE=model.size;
  if(session) {await session.release();session=null;}
  ort.env.wasm.wasmPaths=new URL('runtime/',baseURL).href;
  ort.env.wasm.numThreads=1; // Works on GitHub Pages without COOP/COEP headers.
  ort.env.wasm.proxy=false;
  ort.env.webgpu.powerPreference='high-performance';
  ort.env.logLevel='error';
  const bytes=await modelBytes(new URL('models/'+model.file,baseURL).href,model);
  self.postMessage({type:'progress',progress:100,text:'正在初始化推理引擎，首次使用需要片刻…'});
  let fallback='';
  if(preferred!=='wasm' && navigator.gpu) {
    try {
      session=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu'],graphOptimizationLevel:'all'});
      backend='WebGPU';
      await warmup();
    } catch(error) {fallback=String(error.message||error);if(session) await session.release().catch(()=>{});session=null;}
  }
  if(!session) {
    session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    backend='CPU / WASM';await warmup();
  }
  drawing=new OffscreenCanvas(SIZE,SIZE);context=drawing.getContext('2d',{willReadFrequently:true});
  tracker.reset();self.postMessage({type:'ready',backend,size:SIZE,fallback:Boolean(fallback),fallbackReason:fallback});
}
async function warmup() {
  const input=new ort.Tensor('float32',new Float32Array(3*SIZE*SIZE),[1,3,SIZE,SIZE]);
  let output;
  try {output=await session.run({[session.inputNames[0]]:input});}
  finally {input.dispose();if(output) Object.values(output).forEach(t=>t.dispose());}
}
async function detect({bitmap,confidence,timestamp,still,token,revision}) {
  const started=performance.now();
  let input,output;
  try {
    if(!session) throw new Error('模型尚未就绪');
    const transform=letterbox(bitmap.width,bitmap.height,SIZE);
    context.fillStyle='rgb(114,114,114)';context.fillRect(0,0,SIZE,SIZE);
    context.drawImage(bitmap,transform.padX,transform.padY,transform.resizedWidth,transform.resizedHeight);
    const pixels=context.getImageData(0,0,SIZE,SIZE).data;
    const area=SIZE*SIZE, floats=new Float32Array(area*3);
    for(let i=0;i<area;i++){floats[i]=pixels[4*i]/255;floats[i+area]=pixels[4*i+1]/255;floats[i+area*2]=pixels[4*i+2]/255;}
    input=new ort.Tensor('float32',floats,[1,3,SIZE,SIZE]);
    const inferenceStart=performance.now();
    output=await session.run({[session.inputNames[0]]:input});
    const inferenceMs=performance.now()-inferenceStart;
    const tensor=output[session.outputNames[0]];
    const boxes=decodeDetections(tensor.data,tensor.dims,transform,confidence);
    if (revision !== trackingRevision) {
      tracker.reset();
      trackingRevision = revision;
    }
    const tracks=tracker.update(boxes,timestamp,bitmap.width,bitmap.height,still);
    self.postMessage({type:'result',tracks,width:bitmap.width,height:bitmap.height,processingMs:performance.now()-started,inferenceMs,token,revision});
  } finally {bitmap.close();input?.dispose();if(output) Object.values(output).forEach(t=>t.dispose());}
}
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init') await initialize(data);
    else if(data.type==='detect') await detect(data);
    else if(data.type==='reset') tracker.reset();
  } catch(error) {self.postMessage({type:'error',message:String(error.message||error),token:data.token});}
};
