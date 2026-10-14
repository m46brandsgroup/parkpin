import {distance,validSpot} from './geo.js';
import {bearing} from './navigation.js';
// Visual filtering only: parking, arrival checks and rerouting retain real fixes.
export function createLocationDisplay(){
 let shown=null,anchor=null,lastTime=0,lastAccepted=0;
 return fix=>{
  if(!validSpot(fix)||!Number.isFinite(fix.accuracy)||fix.accuracy<0)return shown;
  if(fix.time<=lastTime)return shown;
  lastTime=fix.time;
  if(!shown||fix.time-lastAccepted>30000){shown={...fix,coords:[...fix.coords],heading:null};anchor=shown;lastAccepted=fix.time;return shown;}
  if(fix.accuracy>50)return shown;
  const seconds=(fix.time-lastAccepted)/1000,gap=distance(shown.coords,fix.coords);
  // Reject isolated jumps; allow a new fix after a sustained tracking gap.
  if(gap>Math.max(40,seconds*60+fix.accuracy))return shown;
  const deadband=Math.max(2,Math.min(8,fix.accuracy*.3));
  const alpha=1-Math.exp(-seconds/(fix.accuracy<=10?2:4));
  const coords=gap<deadband?shown.coords:shown.coords.map((v,i)=>v+(fix.coords[i]-v)*alpha);
  let heading=shown.heading;
  if(distance(anchor.coords,coords)>=Math.max(8,Math.min(15,fix.accuracy))){
   const next=bearing(anchor.coords,coords);
   heading=Number.isFinite(heading)?heading+(((next-heading+540)%360)-180)*.35:next;
   anchor={coords};
  }
  shown={...fix,coords,heading};lastAccepted=fix.time;return shown;
 };
}
