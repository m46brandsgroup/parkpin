import {distance} from './geo.js';
export const MAX_TRACK_POINTS=3000;
export function appendTrack(track,position){
 if(!position||position.accuracy>35||Date.now()-position.time>30000)return track;
 const last=track.at(-1);
 if(last&&(position.time<=last.time||distance(last.coords,position.coords)<8))return track;
 let result=[...track,{coords:[...position.coords],time:Math.round(position.time),accuracy:position.accuracy}];
 // Retain the start and newest point; simplify older samples on long walks.
 if(result.length>MAX_TRACK_POINTS)result=result.filter((_,i)=>i===0||i===result.length-1||i%2===0);
 return result;
}
export function fastestRoute(routes){return routes.filter(r=>Number.isFinite(r.duration)&&r.duration>=0&&r.geometry?.type==='LineString').sort((a,b)=>a.duration-b.duration)[0]||null;}
export function bearing(a,b){const r=Math.PI/180,dl=(b[0]-a[0])*r;return Math.atan2(Math.sin(dl)*Math.cos(b[1]*r),Math.cos(a[1]*r)*Math.sin(b[1]*r)-Math.sin(a[1]*r)*Math.cos(b[1]*r)*Math.cos(dl))/r;}

// Match each GPS fix to the walking steps so guidance advances between API refreshes.
export function walkingGuidance(route,position){
 if(!route||!position)return null;
 const steps=route.legs.flatMap(leg=>leg.steps||[]);
 const segments=[];let total=0;
 for(let index=0;index<steps.length;index++){
  const coords=steps[index].geometry?.coordinates||[];
  for(let i=1;i<coords.length;i++){
   const a=coords[i-1],b=coords[i],length=distance(a,b);if(!length)continue;
   segments.push({a,b,length,start:total,index});total+=length;
  }
 }
 if(!segments.length){const first=steps[0];return {step:steps[1]||first,distance:first?.distance??0,remaining:route.distance,duration:route.duration,offRoute:false};}
 const origin=position.coords,scaleX=111320*Math.cos(origin[1]*Math.PI/180),scaleY=111320;
 let closest=null;
 for(const segment of segments){
  const ax=(segment.a[0]-origin[0])*scaleX,ay=(segment.a[1]-origin[1])*scaleY;
  const dx=(segment.b[0]-segment.a[0])*scaleX,dy=(segment.b[1]-segment.a[1])*scaleY;
  const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy)));
  const gap=Math.hypot(ax+t*dx,ay+t*dy);
  // Keep the earlier segment at a crossing until the GPS fix moves beyond it.
  if(!closest||gap<closest.gap-0.5)closest={...segment,t,gap};
 }
 const progress=closest.start+closest.t*closest.length;
 let index=closest.index;
 const endOfStep=i=>{const pieces=segments.filter(s=>s.index===i);return pieces.length?pieces.at(-1).start+pieces.at(-1).length:progress;};
 let toTurn=Math.max(0,endOfStep(index)-progress);
 if(toTurn<8&&index<steps.length-2){index++;toTurn=Math.max(0,endOfStep(index)-progress);}
 const remaining=route.distance*Math.max(0,1-progress/total);
 return {step:steps[index+1]||steps[index],distance:toTurn,remaining,duration:route.duration*Math.max(0,1-progress/total),offRoute:closest.gap>Math.max(35,position.accuracy||0)};
}
