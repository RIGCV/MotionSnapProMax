import { iou } from './detection.js';
const center = box => [(box.x1+box.x2)/2, (box.y1+box.y2)/2];
// Lightweight class-aware IoU + predicted-center association. No identity/ReID claims.
export class Tracker {
  constructor() { this.reset(); }
  reset() { this.tracks = []; this.nextId = 1; }
  update(boxes, timestamp, width, height, still = false) {
    if (still) this.reset();
    const diagonal = Math.hypot(width, height);
    this.tracks = this.tracks.filter(t => timestamp-t.lastSeen < 1200);
    const pairs = [];
    this.tracks.forEach((track, ti) => {
      const dt = Math.min((timestamp-track.lastSeen)/1000, .5);
      const predicted = { ...track, x1:track.x1+track.vx*dt, x2:track.x2+track.vx*dt, y1:track.y1+track.vy*dt, y2:track.y2+track.vy*dt };
      boxes.forEach((box, bi) => {
        if (box.cls !== track.cls) return;
        const overlap = iou(predicted,box), a=center(predicted), b=center(box);
        const distance=Math.hypot(a[0]-b[0],a[1]-b[1])/diagonal;
        const areaA=(track.x2-track.x1)*(track.y2-track.y1), areaB=(box.x2-box.x1)*(box.y2-box.y1);
        const ratio=Math.min(areaA,areaB)/Math.max(areaA,areaB);
        if ((overlap > .12 || distance < .045) && ratio > .25) pairs.push({ ti,bi,cost:overlap*2-distance });
      });
    });
    pairs.sort((a,b)=>b.cost-a.cost);
    const takenTracks=new Set(), takenBoxes=new Set(), assignments=new Map();
    for(const p of pairs) if(!takenTracks.has(p.ti)&&!takenBoxes.has(p.bi)) {takenTracks.add(p.ti);takenBoxes.add(p.bi);assignments.set(p.bi,this.tracks[p.ti]);}
    const visible=boxes.map((box,bi)=>{
      let t=assignments.get(bi); const c=center(box);
      if(!t) {
        t={...box,id:this.nextId++,vx:0,vy:0,lastSeen:timestamp,hits:0,history:[],moving:false,speed:0};
        this.tracks.push(t);
      } else {
        const previous=center(t), dt=Math.max(.016,(timestamp-t.lastSeen)/1000);
        t.vx=.5*t.vx+.5*(c[0]-previous[0])/dt;
        t.vy=.5*t.vy+.5*(c[1]-previous[1])/dt;
      }
      Object.assign(t,box,{lastSeen:timestamp,hits:t.hits+1});
      t.history.push({x:c[0],y:c[1],time:timestamp});
      t.history=t.history.filter(p=>timestamp-p.time<2200).slice(-32);
      const reference=t.history.find(p=>timestamp-p.time<=700)||t.history[0];
      const elapsed=(timestamp-reference.time)/1000;
      t.speed=elapsed>.15?Math.hypot(c[0]-reference.x,c[1]-reference.y)/diagonal/elapsed:0;
      // Suppress detector jitter; movement is relative to the image, not world speed.
      t.moving=!still && t.hits>=3 && elapsed>=.2 && t.speed>(t.moving?.006:.012);
      return {...t,history:[...t.history]};
    });
    return visible;
  }
}
