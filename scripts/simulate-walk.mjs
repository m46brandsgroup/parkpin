// Isolated, visible Chrome simulation. Run: node scripts/simulate-walk.mjs
import {chromium} from '@playwright/test';
import {distance} from '../src/geo.js';
import {bearing} from '../src/navigation.js';
const start=[88.4265,22.5789],parking=[88.422,22.5750];
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:430,height:880}});
await context.addInitScript(({start,parking})=>{
 const now=Date.now();
 localStorage.setItem('parkpin-history',JSON.stringify({version:1,records:[{id:'simulated-parking',coords:parking,time:now-600000,accuracy:5,hasLeft:true,endedAt:null,endReason:null,track:[]}]}));
 let point=start,heading=0;const watchers=new Map();let id=0;
 const fix=()=>({coords:{longitude:point[0],latitude:point[1],accuracy:5,heading,speed:1.4,altitude:null,altitudeAccuracy:null},timestamp:Date.now()});
 Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){setTimeout(()=>ok(fix()),10);},watchPosition(ok){const key=++id;watchers.set(key,ok);setTimeout(()=>ok(fix()),10);return key;},clearWatch(key){watchers.delete(key);}}});
 window.simulateGPS=(coords,nextHeading)=>{point=coords;heading=nextHeading;watchers.forEach(ok=>ok(fix()));};
},{start,parking});
const page=await context.newPage();
const routeResponse=page.waitForResponse(r=>r.url().includes('/directions/v5/mapbox/walking/')&&r.status()===200,{timeout:60000});
await page.goto('http://localhost:5173/');
await page.evaluate(()=>{
 const badge=document.createElement('div');badge.id='simulation-badge';badge.textContent='TEST GPS · Walking at 1.4 m/s';Object.assign(badge.style,{position:'fixed',bottom:'4px',left:'50%',transform:'translateX(-50%)',zIndex:50,background:'#fff3c4',color:'#483700',padding:'6px 12px',borderRadius:'12px',font:'12px sans-serif',whiteSpace:'nowrap'});document.body.append(badge);
});
try{
 const data=await (await routeResponse).json();
 const route=data.routes.filter(r=>r.geometry?.coordinates?.length>1).sort((a,b)=>a.duration-b.duration)[0];
 if(!route)throw Error('No walking route returned');
 await page.waitForFunction(()=>document.getElementById('map-placeholder').hidden,null,{timeout:45000});
 const points=[start,...route.geometry.coordinates,parking];
 console.log(`Simulation started: ${start[1]}, ${start[0]} → ${parking[1]}, ${parking[0]}. Route ${Math.round(route.distance)} m; 1.4 m/s. Visible Chrome window uses test-only storage.`);
 await page.screenshot({path:'/tmp/parkpin-simulation-start.png'});
 let segment=0,offset=0,ticks=0;
 while(segment<points.length-1&&!page.isClosed()){
  let remaining=1.4;
  while(segment<points.length-1){const length=distance(points[segment],points[segment+1]);if(length-offset>remaining){offset+=remaining;break;}remaining-=Math.max(0,length-offset);segment++;offset=0;}
  const a=points[Math.min(segment,points.length-1)],b=points[Math.min(segment+1,points.length-1)];
  const ratio=distance(a,b)?offset/distance(a,b):0;
  const coords=[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
  await page.evaluate(({coords,heading})=>window.simulateGPS(coords,heading),{coords,heading:bearing(a,b)});
  if(++ticks%30===0)console.log(`Walking: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)} (${ticks}s)`);
  await page.waitForTimeout(1000);
 }
 for(let i=0;i<12&&!page.isClosed();i++){await page.evaluate(parking=>window.simulateGPS(parking,0),parking);await page.waitForTimeout(1000);}
 if(!page.isClosed()){await page.screenshot({path:'/tmp/parkpin-simulation-arrived.png'});console.log('Simulation finished. Arrival state:',await page.locator('#feedback').textContent());await page.evaluate(()=>document.getElementById('simulation-badge').textContent='TEST GPS · Arrived at parking');}
}catch(error){console.error('Simulation stopped:',error.message);}
// Keep the test window available for inspection until it is closed.
if(browser.isConnected())await new Promise(resolve=>browser.on('disconnected',resolve));
