import {test} from 'node:test';import assert from 'node:assert/strict';import{distance,validSpot,formatDistance}from './geo.js';
test('distance handles identical locations and known separation',()=>{assert.equal(distance([0,0],[0,0]),0);assert.ok(Math.abs(distance([0,0],[0,1])-111195)<2);assert.ok(distance([179.999,0],[-179.999,0])<225)});
test('persisted spots reject malformed and out-of-bounds coordinates',()=>{assert.equal(validSpot({coords:[77.59,12.97],time:1}),true);for(const p of [{coords:[181,0],time:1},{coords:[0,91],time:1},{coords:['0',0],time:1},{coords:[0,0],time:'bad'}])assert.equal(validSpot(p),false)});
test('walking distance formatting',()=>{assert.equal(formatDistance(125),'125 m');assert.equal(formatDistance(1520),'1.5 km')});
