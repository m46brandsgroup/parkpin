import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyDistance,validateJourneys,mergeJourneys} from './explore-data.js';
const point=(x,time,accuracy=5)=>({coords:[x,0],time,accuracy});
const j={id:'trip',startedAt:1000,endedAt:4000,brief:'Walk',points:[point(0,1000),point(.001,4000)]};
const data=journeys=>({app:'Parkpin Explore',version:1,journeys});
test('distance measures movement while excluding jitter, poor fixes and gaps',()=>{
 assert.ok(Math.abs(journeyDistance(j.points)-111.19)<1);
 assert.equal(journeyDistance([point(0,1000),point(.000001,2000)]),0);
 assert.equal(journeyDistance([point(0,1000),point(.001,4000,100),point(.002,5000)]),0);
 assert.equal(journeyDistance([point(0,1000),point(.001,32000)]),0);
 assert.equal(journeyDistance([point(0,1000),point(1,2000)]),0);
});
test('validates backup and rejects invalid coordinates, times and duplicate IDs',()=>{
 assert.deepEqual(validateJourneys(data([j])),[j]);
 for(const invalid of [{...j,points:[point(181,1000)]},{...j,points:[point(0,2000),point(0,1000)]},{...j,endedAt:500}])assert.throws(()=>validateJourneys(data([invalid])));
 assert.throws(()=>validateJourneys(data([j,j])));
});
test('merge preserves existing completed journey and sorts newest first',()=>{
 const newer={...j,id:'new',startedAt:5000,endedAt:null,points:[]};
 const merged=mergeJourneys([j],[{...j,endedAt:null},newer]);
 assert.deepEqual(merged,[newer,j]);
});
