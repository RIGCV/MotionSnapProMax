import test from 'node:test';
import assert from 'node:assert/strict';
import { letterbox, decodeDetections, matchesCategory } from '../src/detection.js';
import { Tracker } from '../src/tracker.js';
test('letterbox correctly maps a portrait image back to source coordinates',()=>{
  const transform=letterbox(800,1200);
  const {scale,padX,padY}=transform;
  const row=new Float32Array([100*scale+padX,200*scale+padY,400*scale+padX,900*scale+padY,.9,0]);
  const [box]=decodeDetections(row,[1,1,6],transform);
  assert.ok(Math.abs(box.x1-100)<.001);assert.ok(Math.abs(box.y2-900)<.001);
});
test('decoder retains multiple detections, clips bounds and rejects invalid rows',()=>{
  const boxes=decodeDetections(new Float32Array([-20,-10,100,100,.9,0,200,200,800,700,.8,2,10,10,20,20,.1,1,40,40,20,20,.9,1]),[1,4,6],letterbox(640,640));
  assert.equal(boxes.length,2);assert.equal(boxes[0].x1,0);assert.equal(boxes[1].x2,640);
  assert.throws(()=>decodeDetections([], [1,84,8400],letterbox(640,640)),/模型输出不兼容/);
});
test('tracker preserves distinct class IDs and does not match two boxes to one track',()=>{
  const t=new Tracker();const box=(x,cls=0)=>({x1:x,y1:10,x2:x+80,y2:150,cls,score:.9});
  const first=t.update([box(10),box(200),box(400,2)],0,640,480);
  const second=t.update([box(202),box(12),box(402,2)],100,640,480);
  assert.deepEqual(second.map(b=>b.id),[first[1].id,first[0].id,first[2].id]);
  const third=t.update([box(14),box(18)],200,640,480);assert.notEqual(third[0].id,third[1].id);
});
test('movement requires sustained displacement; still images never move; stale tracks expire',()=>{
  const t=new Tracker();const box=x=>({x1:x,y1:20,x2:x+80,y2:150,cls:0,score:.9});
  t.update([box(10)],0,640,480);t.update([box(20)],200,640,480);
  const [moving]=t.update([box(30)],400,640,480);assert.equal(moving.moving,true);
  const [newTrack]=t.update([box(30)],2000,640,480);assert.notEqual(newTrack.id,moving.id);
  assert.equal(t.update([box(100)],2200,640,480,true)[0].moving,false);
  assert.equal(matchesCategory(2,'person'),false);assert.equal(matchesCategory(2,'traffic'),true);
});
