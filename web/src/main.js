import './styles.css';
import { CLASS_NAMES, COLORS, matchesCategory } from './detection.js';

const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d');
const frame=document.createElement('canvas'),frameCtx=frame.getContext('2d');
let worker, modelReady=false, modelMode, initPromise, rejectInit;
let stream, objectURL, sourceImage, running=false, starting=false, token=0, timer, renderTimer, busy=false;
let tracks=[],lastResultAt=0,actualFPS=0,sourceType='camera', selectedFile;
let lastVideoTime=-1;
const status=(message,error=false)=>{$('statusText').textContent=message;$('statusText').classList.toggle('error',error);};
const color=id=>COLORS[(id-1)%COLORS.length];
const sourceRadios=[...document.querySelectorAll('input[name=source]')];
function updateButtons(){
  $('start').disabled=starting||running;
  $('emptyStart').disabled=starting||running;
  $('emptyDemo').disabled=starting||running;
  $('stop').disabled=!starting&&!running;
  $('backend').disabled=starting||running;
  $('quality').disabled=starting||running;
  $('cameraSelect').disabled=starting||running;
}
function visibleTracks(){return tracks.filter(t=>matchesCategory(t.cls,$('category').value)&&(!$('movingOnly').checked||t.moving));}
function renderResults(){
  const visible=visibleTracks();
  $('targetCount').textContent=visible.length;
  $('movingCount').textContent=visible.filter(t=>t.moving).length;
  $('listCount').textContent=String(visible.length).padStart(2,'0');
  const list=$('targetList');list.replaceChildren();
  if(!visible.length){const empty=document.createElement('div');empty.className='list-empty';empty.textContent=$('movingOnly').checked?'当前没有满足条件的移动目标。':'当前没有满足条件的目标。';list.append(empty);}
  for(const t of visible.slice(0,60)){
    const card=document.createElement('div');card.className='target-card';card.style.setProperty('--target-color',color(t.id));
    const top=document.createElement('div');top.className='target-top';
    const name=document.createElement('span');name.textContent=CLASS_NAMES[t.cls]||`类别 ${t.cls}`;
    const id=document.createElement('small');id.textContent=`#${String(t.id).padStart(2,'0')}`;
    top.append(name,id);
    const bottom=document.createElement('div');bottom.className='target-bottom';
    const motion=document.createElement('span');motion.textContent=sourceImage?'静态图片':t.moving?'↗ 移动中':t.hits<3?'正在观察':'静止 / 微动';if(t.moving)motion.className='is-moving';
    const score=document.createElement('span');score.textContent=`${Math.round(t.score*100)}%`;
    bottom.append(motion,score);card.append(top,bottom);list.append(card);
  }
  if(visible.length>60){const note=document.createElement('div');note.className='list-empty';note.textContent=`另有 ${visible.length-60} 个目标，全部目标仍在画面中显示。`;list.append(note);}
}
function draw(){
  if(!frame.width||canvas.hidden)return;
  const displaySource=running&&!sourceImage&&video.readyState>=2?video:frame;
  ctx.drawImage(displaySource,0,0,canvas.width,canvas.height);
  const line=Math.max(2,canvas.width/650), fontSize=Math.max(13,canvas.width/65);
  ctx.lineWidth=line;ctx.font=`600 ${fontSize}px "Segoe UI","Microsoft YaHei",sans-serif`;
  for(const t of visibleTracks()){
    const stroke=color(t.id);ctx.strokeStyle=stroke;
    if($('trails').checked && !sourceImage && t.history.length>1){
      ctx.beginPath();t.history.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.globalAlpha=.7;ctx.stroke();ctx.globalAlpha=1;
    }
    ctx.strokeRect(t.x1,t.y1,t.x2-t.x1,t.y2-t.y1);
    const label=`#${t.id} ${CLASS_NAMES[t.cls]} ${Math.round(t.score*100)}%${t.moving?' ↗':''}`;
    const w=ctx.measureText(label).width+12,h=fontSize+12;
    const x=Math.max(0,Math.min(t.x1,canvas.width-w)),y=t.y1>=h?t.y1-h:Math.min(t.y1,canvas.height-h);
    ctx.fillStyle=stroke;ctx.fillRect(x,y,w,h);ctx.fillStyle='#152013';ctx.fillText(label,x+6,y+fontSize+3);
  }
}
function renderLive(){
  if(!running||sourceImage)return;
  if(!document.hidden)draw();
  renderTimer=requestAnimationFrame(renderLive);
}
function handleResult(data){
  if(data.token!==token)return;
  busy=false;
  tracks=data.tracks;
  const now=performance.now();
  if(lastResultAt)actualFPS=actualFPS?actualFPS*.65+1000/(now-lastResultAt)*.35:1000/(now-lastResultAt);
  lastResultAt=now;
  $('fps').textContent=sourceImage?'—':actualFPS?actualFPS.toFixed(1):'…';
  $('latency').textContent=Math.round(data.processingMs);
  $('snapshot').disabled=false;
  draw();renderResults();
  if(sourceImage){
    running=false;$('stageStatus').textContent='图片检测完成';$('liveDot').classList.remove('active');updateButtons();
    status('图片检测完成 · 可调整类别、查看结果或下载截图');
  }else if(running){
    status(`正在本地检测 · ${data.tracks.length} 个目标 · 仅处理最新帧`);
    const wait=Math.max(0,1000/Number($('speed').value)-data.processingMs);
    timer=setTimeout(submitFrame,wait);
  }
}
async function ensureModel(){
  const preferred=$('backend').value;
  const size=Number($('quality').value),mode=preferred+'-'+size;
  if(modelReady&&mode===modelMode)return;
  if(initPromise&&mode===modelMode)return initPromise;
  worker?.terminate();modelReady=false;modelMode=mode;
  worker=new Worker(new URL('./inference.worker.js',import.meta.url),{type:'module'});
  $('loadProgress').hidden=false;$('engineDot').classList.remove('active');$('engineStatus').textContent='正在加载模型';
  const promise=new Promise((resolve,reject)=>{
    rejectInit=reject;
    worker.onmessage=({data})=>{
      if(data.type==='progress'){$('progress').value=data.progress;$('loadText').textContent=data.text;}
      if(data.type==='ready'){
        modelReady=true;$('loadProgress').hidden=true;$('engineDot').classList.add('active');
        $('engineStatus').textContent=`YOLO26n · ${data.size} · ${data.backend}${data.fallback?' · 已切换':''}`;
        $('footerEngine').textContent=`YOLO26n · ${data.size} × ${data.size} · 浏览器本地推理`;
        resolve();
      }
      if(data.type==='result')handleResult(data);
      if(data.type==='error'){
        if(!modelReady)reject(new Error(data.message));
        else if(data.token===token){fail(new Error(data.message));}
      }
    };
    worker.onerror=event=>{const error=new Error(event.message||'推理线程启动失败，请重新加载页面。');if(!modelReady)reject(error);else fail(error);};
    worker.postMessage({type:'init',preferred,size,baseURL:new URL(import.meta.env.BASE_URL,location.href).href});
  });
  initPromise=promise;
  try{await promise;}finally{if(initPromise===promise){initPromise=null;rejectInit=null;}}
}
function stop({keepStatus=false}={}){
  const wasBusy=busy;
  token++;running=false;starting=false;busy=false;clearTimeout(timer);cancelAnimationFrame(renderTimer);
  if(wasBusy&&worker){worker.terminate();worker=null;modelReady=false;modelMode=null;$('engineDot').classList.remove('active');$('engineStatus').textContent='模型已释放 · 下次启动从缓存读取';}
  if(!modelReady&&worker){worker.terminate();worker=null;rejectInit?.(new Error('已取消加载'));initPromise=null;rejectInit=null;$('loadProgress').hidden=true;$('engineStatus').textContent='模型加载已取消';}
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}
  worker?.postMessage({type:'reset'});
  $('liveDot').classList.remove('active');$('stageStatus').textContent='已停止 · 最后一帧';
  updateButtons();if(!keepStatus)status('检测已停止 · 摄像头已释放');
}
function fail(error){stop({keepStatus:true});status(friendlyError(error),true);}
function friendlyError(error){
  const messages={NotAllowedError:'摄像头权限被拒绝。请在浏览器地址栏允许访问摄像头后重试。',NotFoundError:'未找到摄像头，请连接摄像头，或选择本地视频 / 示例图片。',NotReadableError:'摄像头无法打开，可能被其他应用占用。请关闭占用它的应用后重试。',OverconstrainedError:'所选摄像头不可用，请尝试默认摄像头。'};
  return messages[error.name]||error.message||String(error);
}
async function enumerateCameras(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const devices=await navigator.mediaDevices.enumerateDevices();const current=$('cameraSelect').value;
  $('cameraSelect').replaceChildren(new Option('默认摄像头',''));
  devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('cameraSelect').add(new Option(d.label||`摄像头 ${i+1}`,d.deviceId)));
  if([...$('cameraSelect').options].some(o=>o.value===current))$('cameraSelect').value=current;
}
function waitForMedia(element,event,errorMessage){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error(errorMessage)),20000);
    function finish(error){clearTimeout(timer);element.removeEventListener(event,onReady);element.removeEventListener('error',onError);error?reject(error):resolve();}
    const onReady=()=>finish(),onError=()=>finish(new Error(errorMessage));
    element.addEventListener(event,onReady,{once:true});element.addEventListener('error',onError,{once:true});
  });
}
async function start(){
  if(starting||running)return;
  stop({keepStatus:true});const thisToken=token;starting=true;sourceImage=null;tracks=[];actualFPS=0;lastResultAt=0;lastVideoTime=-1;
  $('snapshot').disabled=true;updateButtons();status('正在准备输入源…');
  try{
    if(!isSecureContext)throw new Error('请通过 HTTPS 或 localhost 打开网页，以使用本地推理与摄像头。');
    if(!globalThis.Worker||!globalThis.OffscreenCanvas)throw new Error('当前浏览器缺少必要功能，请使用新版 Chrome、Edge 或支持 OffscreenCanvas 的浏览器。');
    sourceType=document.querySelector('input[name=source]:checked').value;
    let title='';
    if(sourceType==='camera'){
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前浏览器无法访问摄像头，请使用 HTTPS 打开网页。');
      const deviceId=$('cameraSelect').value;
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},facingMode:'environment',...(deviceId?{deviceId:{exact:deviceId}}:{})}});
      if(thisToken!==token){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;const ready=waitForMedia(video,'loadeddata','摄像头画面加载超时，请重试。');video.srcObject=stream;await ready;await video.play();
      enumerateCameras().catch(()=>{});title='摄像头 · 实时画面';
    }else if(sourceType==='demo'||selectedFile?.type.startsWith('image/')){
      const image=new Image();
      const ready=waitForMedia(image,'load','图片无法读取，请尝试其他图片或检查网络。');
      if(sourceType==='demo')image.src=new URL('demo/bus.jpg',new URL(import.meta.env.BASE_URL,location.href)).href;
      else{objectURL=URL.createObjectURL(selectedFile);image.src=objectURL;}
      await ready;if(thisToken!==token)return;sourceImage=image;title=sourceType==='demo'?'街景示例 · 静态图片':selectedFile.name;
    }else{
      if(!selectedFile)throw new Error('请先选择一段本地视频或图片。');
      const ready=waitForMedia(video,'loadeddata','视频无法读取，建议使用浏览器支持的 MP4 / WebM 文件。');
      objectURL=URL.createObjectURL(selectedFile);video.src=objectURL;await ready;title=selectedFile.name;
    }
    if(thisToken!==token)return;
    const width=sourceImage?sourceImage.naturalWidth:video.videoWidth,height=sourceImage?sourceImage.naturalHeight:video.videoHeight;
    // Bound large uploads/camera frames, keeping aspect ratio and worker transfer cost predictable.
    const scale=Math.min(1,1600/Math.max(width,height));frame.width=canvas.width=Math.round(width*scale);frame.height=canvas.height=Math.round(height*scale);
    frameCtx.drawImage(sourceImage||video,0,0,frame.width,frame.height);
    canvas.hidden=false;$('emptyState').hidden=true;draw();
    $('sourceTitle').textContent=title;$('sourceResolution').textContent=`${width} × ${height}`;
    $('fps').textContent='—';$('latency').textContent='—';renderResults();
    status('正在加载本地检测模型…');await ensureModel();if(thisToken!==token)return;
    if(sourceType==='file'&&!sourceImage){await video.play();if(thisToken!==token)return;}
    worker.postMessage({type:'reset'});starting=false;running=true;updateButtons();
    $('stageLabel').hidden=false;$('stageStatus').textContent=sourceImage?'分析图片中':'正在检测';$('liveDot').classList.add('active');
    if(!sourceImage)renderLive();
    await submitFrame();
  }catch(error){if(thisToken===token)fail(error);}
}
async function submitFrame(){
  if(!running||busy)return;
  if(!sourceImage&&(video.paused||video.ended)){if(video.ended)stop();else timer=setTimeout(submitFrame,100);return;}
  if(document.hidden){timer=setTimeout(submitFrame,250);return;}
  if(!sourceImage&&video.currentTime===lastVideoTime){timer=setTimeout(submitFrame,16);return;}
  const thisToken=token;busy=true;
  try{
    lastVideoTime=video.currentTime;
    frameCtx.drawImage(sourceImage||video,0,0,frame.width,frame.height);
    const bitmap=await createImageBitmap(frame);
    if(thisToken!==token){bitmap.close();return;}
    worker.postMessage({type:'detect',bitmap,confidence:Number($('confidence').value)/100,timestamp:performance.now(),still:Boolean(sourceImage),token},[bitmap]);
  }catch(error){if(thisToken===token)fail(error);}
}
function selectSource(value){
  stop({keepStatus:true});sourceImage=null;tracks=[];
  for(const radio of sourceRadios)radio.checked=radio.value===value;
  for(const name of ['camera','file','demo'])$(name+'Options').hidden=name!==value;
  $('stageLabel').hidden=true;canvas.hidden=true;$('emptyState').hidden=false;$('snapshot').disabled=true;
  $('fps').textContent='—';$('latency').textContent='—';renderResults();status('已切换输入源 · 点击开始检测');
}
sourceRadios.forEach(r=>r.addEventListener('change',()=>selectSource(r.value)));
$('start').onclick=start;
$('stop').onclick=()=>stop();
$('emptyStart').onclick=()=>{selectSource('camera');start();};
$('emptyDemo').onclick=()=>{selectSource('demo');start();};
$('fileInput').onchange=event=>{const file=event.target.files[0];if(!file)return;stop({keepStatus:true});selectedFile=file;$('fileName').textContent=file.name;status('文件已选择 · 点击开始检测');};
$('confidence').oninput=()=>{$('confidenceValue').textContent=$('confidence').value+'%';};
$('confidence').onchange=()=>{if(sourceImage&&!running&&!starting)start();};
for(const id of ['category','trails','movingOnly'])$(id).onchange=()=>{draw();renderResults();};
$('snapshot').onclick=()=>canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`MotionSnap-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else status('当前浏览器不支持全屏显示。');}catch{status('无法进入全屏，请检查浏览器设置。');}};
video.addEventListener('ended',()=>{stop({keepStatus:true});status('视频播放结束 · 可下载最后一帧或重新开始');});
window.addEventListener('pagehide',()=>{stop({keepStatus:true});worker?.terminate();});
enumerateCameras().catch(()=>{});
updateButtons();
