export const CLASS_NAMES = ['人员','自行车','汽车','摩托车','飞机','公交车','火车','卡车','船','交通信号灯','消防栓','停车标志','停车计时器','长椅','鸟','猫','狗','马','羊','牛','大象','熊','斑马','长颈鹿','背包','雨伞','手提包','领带','行李箱','飞盘','滑雪板','单板滑雪板','球','风筝','棒球棒','棒球手套','滑板','冲浪板','网球拍','瓶子','酒杯','杯子','叉子','刀','勺子','碗','香蕉','苹果','三明治','橙子','西兰花','胡萝卜','热狗','披萨','甜甜圈','蛋糕','椅子','沙发','盆栽','床','餐桌','马桶','电视','笔记本电脑','鼠标','遥控器','键盘','手机','微波炉','烤箱','烤面包机','水槽','冰箱','书','时钟','花瓶','剪刀','泰迪熊','吹风机','牙刷'];
export const COLORS = ['#c6f76f','#67d9ee','#ffb379','#c4a3ff','#ff87b7','#80e8bf'];
export function letterbox(width, height, size = 640) {
  const scale = Math.min(size / width, size / height);
  const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
  return { width, height, size, scale, resizedWidth, resizedHeight,
    padX: Math.floor((size - resizedWidth) / 2), padY: Math.floor((size - resizedHeight) / 2) };
}
export function decodeDetections(data, dims, transform, confidence = .35) {
  if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== 6) throw new Error(`模型输出不兼容：${dims.join('×')}，需要 YOLO26 端到端模型。`);
  const { padX, padY, scale, width, height } = transform;
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  const result = [];
  for (let i = 0; i < dims[1]; i++) {
    const offset = i * 6, score = data[offset + 4], cls = Math.round(data[offset + 5]);
    if (!Number.isFinite(score) || score < confidence || cls < 0 || cls >= 80) continue;
    const x1 = clamp((data[offset] - padX) / scale, width);
    const y1 = clamp((data[offset + 1] - padY) / scale, height);
    const x2 = clamp((data[offset + 2] - padX) / scale, width);
    const y2 = clamp((data[offset + 3] - padY) / scale, height);
    if (![x1,y1,x2,y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) continue;
    result.push({ x1, y1, x2, y2, score, cls });
  }
  return result;
}
export function matchesCategory(cls, category) {
  if (category === 'person') return cls === 0;
  if (category === 'traffic') return cls >= 0 && cls <= 8;
  if (category === 'animals') return cls >= 14 && cls <= 23;
  return true;
}
export function iou(a, b) {
  const intersection = Math.max(0, Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1)) * Math.max(0, Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));
  const union = (a.x2-a.x1)*(a.y2-a.y1)+(b.x2-b.x1)*(b.y2-b.y1)-intersection;
  return union > 0 ? intersection / union : 0;
}
