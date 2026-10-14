import {test} from 'node:test';import assert from 'node:assert/strict';import{appendTrack,fastestRoute,MAX_TRACK_POINTS}from './navigation.js';import {validateHistory} from './history.js';
test('fastest returned walking alternative wins',()=>{const geometry={type:'LineString',coordinates:[[0,0],[1,1]]};assert.equal(fastestRoute([{duration:600,geometry},{duration:300,geometry}]).duration,300);assert.equal(fastestRoute([]),null)});
test('track skips stationary or inaccurate updates and bounds storage',()=>{const time=Date.now();const p={coords:[0,0],time,accuracy:10};const a=appendTrack([],p);assert.equal(appendTrack(a,{...p,time:time+1}),a);assert.equal(appendTrack(a,{...p,accuracy:100,coords:[0.01,0]}),a);assert.equal(appendTrack(a,{...p,time:time+1,coords:[0.01,0]}).length,2);const full=Array.from({length:MAX_TRACK_POINTS},(_,i)=>({...p,time:time-MAX_TRACK_POINTS+i,coords:[i*.0001,0]}));const compact=appendTrack(full,{...p,coords:[1,0]});assert.ok(compact.length<=MAX_TRACK_POINTS);assert.deepEqual(compact[0],full[0]);assert.deepEqual(compact.at(-1).coords,[1,0]);});
test('recorded track round-trips and old backups still load',()=>{const time=Date.now()-1000;const record={id:'a',coords:[0,0],time,accuracy:10,hasLeft:false,endedAt:null,endReason:null};assert.deepEqual(validateHistory({version:1,records:[record]})[0].track,[]);const track=[{coords:[0,0],time,accuracy:10},{coords:[0.01,0],time:time+500,accuracy:10}];assert.deepEqual(validateHistory({version:1,records:[{...record,track}]})[0].track,track);assert.throws(()=>validateHistory({version:1,records:[{...record,track:[{...track[0],coords:[500,0]}]}]}));});

test('turn guidance advances with GPS, reduces remaining distance and detects off-route movement',async()=>{
 const {walkingGuidance}=await import('./navigation.js');
 const route={distance:333,duration:240,legs:[{steps:[
  {distance:111,geometry:{coordinates:[[0,0],[.001,0]]},maneuver:{instruction:'Head east'}},
  {distance:111,geometry:{coordinates:[[.001,0],[.001,.001]]},maneuver:{modifier:'left',instruction:'Turn left onto North Path'}},
  {distance:111,geometry:{coordinates:[[.001,.001],[.002,.001]]},maneuver:{modifier:'right',instruction:'Turn right onto East Path'}},
  {distance:0,geometry:{coordinates:[[.002,.001],[.002,.001]]},maneuver:{type:'arrive',instruction:'Your car is ahead'}}
 ]}]};
 const before=walkingGuidance(route,{coords:[.0005,0],accuracy:10});assert.match(before.step.maneuver.instruction,/left/);assert.ok(before.distance>50&&before.distance<60);
 const after=walkingGuidance(route,{coords:[.001,.0004],accuracy:10});assert.match(after.step.maneuver.instruction,/right/);assert.ok(after.remaining<before.remaining);assert.ok(after.duration<before.duration);
 assert.equal(walkingGuidance(route,{coords:[.003,.003],accuracy:10}).offRoute,true);
});
