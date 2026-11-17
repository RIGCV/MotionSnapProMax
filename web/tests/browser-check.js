const output=document.getElementById('results');
const log=text=>{output.textContent+='\n'+text;};
const preferred=new URLSearchParams(location.search).get('backend')==='wasm'?'wasm':'auto';
const size=new URLSearchParams(location.search).get('size')==='640'?640:320;
const worker=new Worker(new URL('../src/inference.worker.js',import.meta.url),{type:'module'});
let nextMessage;
worker.onmessage=({data})=>{
  if(data.type==='progress')return;
  if(data.type==='error'){nextMessage?.reject(new Error(data.message));nextMessage=null;return;}
  nextMessage?.resolve(data);nextMessage=null;
};
worker.onerror=e=>nextMessage?.reject(new Error(e.message));
function exchange(message,transfer=[]){return new Promise((resolve,reject)=>{nextMessage={resolve,reject};worker.postMessage(message,transfer);});}
try{
  if(navigator.gpu){const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});const info=adapter?.info;log('GPU：'+[info?.vendor,info?.architecture,info?.device,info?.description].filter(Boolean).join(' / '));}
  const ready=await exchange({type:'init',preferred,size,baseURL:new URL('../',location.href).href});
  log('运行方式：'+ready.backend+' / '+ready.size);
  if(ready.fallbackReason)log('GPU 回退原因：'+ready.fallbackReason);
  const image=new Image();image.src='../demo/bus.jpg';await image.decode();
  const timings=[];
  let previousIds;
  for(let i=0;i<6;i++){
    const bitmap=await createImageBitmap(image);
    const result=await exchange({type:'detect',bitmap,confidence:.35,timestamp:i*200,still:false,token:1},[bitmap]);
    const people=result.tracks.filter(t=>t.cls===0).length;
    if(people<2||!result.tracks.some(t=>t.cls===5))throw new Error('示例应至少检出两个人和一辆公交车');
    const ids=result.tracks.map(t=>t.id).join(',');
    if(previousIds&&ids!==previousIds)throw new Error('静态连续帧的跟踪编号不稳定');
    if(result.tracks.some(t=>t.moving))throw new Error('静态连续帧不应被判定为移动');
    previousIds=ids;timings.push(result.processingMs);
    log(`第 ${i+1} 帧：${result.tracks.length} 个目标，${people} 名人员，处理 ${result.processingMs.toFixed(1)} ms，推理 ${result.inferenceMs.toFixed(1)} ms`);
  }
  const steady=timings.slice(2).sort((a,b)=>a-b);
  log(`PASS · 真实模型、多目标、连续编号、静止过滤；后四帧中位处理耗时 ${((steady[1]+steady[2])/2).toFixed(1)} ms`);
}catch(error){log('FAIL · '+error.message);}finally{worker.terminate();}
