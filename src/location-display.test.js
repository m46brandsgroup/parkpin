import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocationDisplay} from './location-display.js';
const fix=(x,y,t,accuracy=10)=>({coords:[x/111320,y/111320],time:100000+t*1000,accuracy,heading:t%2?0:180});
test('reduces straight-walk lateral jitter while retaining forward movement',()=>{
 const filter=createLocationDisplay();filter(fix(0,0,0));let output,rawError=0,filteredError=0;
 for(let i=1;i<=60;i++){const p=fix(i*1.4,i%2?5:-5,i);output=filter(p);rawError+=Math.abs(p.coords[1]);filteredError+=Math.abs(output.coords[1]);}
 assert.ok(filteredError<rawError*.5);assert.ok(output.coords[0]*111320>75);assert.ok(Math.abs(output.heading-90)<15);
});
test('holds stationary noise and rejects poor, old and isolated jumping fixes',()=>{
 const filter=createLocationDisplay(),first=filter(fix(0,0,0));
 assert.deepEqual(filter(fix(1,1,1)).coords,first.coords);
 const good=filter(fix(2,0,2));assert.equal(filter(fix(500,0,3)),good);
 assert.equal(filter(fix(50,0,4,100)),good);assert.equal(filter(fix(40,0,1)),good);
 assert.ok(filter(fix(500,0,40)).coords[0]>.004);
});
test('follows real turns and does not mutate source coordinates',()=>{
 const filter=createLocationDisplay();for(let i=0;i<20;i++)filter(fix(i*2,0,i));
 let output;const p=fix(38,60,50),original=[...p.coords];
 for(let i=20;i<=50;i++)output=filter(fix(38,(i-20)*2,i));
 assert.ok(output.coords[1]*111320>50);assert.ok(Math.abs(output.heading)<30);
 filter(p);assert.deepEqual(p.coords,original);
});
