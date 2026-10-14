import {distance,validSpot} from './geo.js';
export const EXPLORE_KEY='parkpin-explore';
export function journeyDistance(points){
 let metres=0,anchor=null;
 for(const p of points){
  if(p.accuracy>50){anchor=null;continue;}
  if(!anchor||p.time-anchor.time>30000){anchor=p;continue;}
  const gap=distance(anchor.coords,p.coords);
  if(gap/(Math.max(1,p.time-anchor.time)/1000)>80){anchor=p;continue;}
  if(gap>=Math.max(5,Math.min(20,(anchor.accuracy+p.accuracy)/2))){metres+=gap;anchor=p;}
 }
 return metres;
}
export function validateJourneys(data){
 if(data?.app!=='Parkpin Explore'||data.version!==1||!Array.isArray(data.journeys)||data.journeys.length>10000)throw Error('Choose a Parkpin Explore JSON backup.');
 const now=Date.now()+300000;
 const journeys=data.journeys.map(j=>{
  if(typeof j.id!=='string'||!j.id||j.id.length>128||!Number.isSafeInteger(j.startedAt)||j.startedAt<0||j.startedAt>now||!(j.endedAt===null||(Number.isSafeInteger(j.endedAt)&&j.endedAt>=j.startedAt&&j.endedAt<=now))||typeof j.brief!=='string'||j.brief.length>500||!Array.isArray(j.points)||j.points.length>100000)throw Error('Invalid journey in backup.');
  let previous=j.startedAt-1;
  const points=j.points.map(p=>{
   if(!validSpot(p)||!Number.isSafeInteger(p.time)||p.time<=previous||p.time<j.startedAt||p.time>(j.endedAt??now)||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>100000)throw Error('Invalid journey location.');
   previous=p.time;return {coords:[...p.coords],time:p.time,accuracy:p.accuracy};
  });
  return {id:j.id,startedAt:j.startedAt,endedAt:j.endedAt,brief:j.brief,points};
 });
 if(new Set(journeys.map(j=>j.id)).size!==journeys.length||journeys.filter(j=>j.endedAt===null).length>1)throw Error('Duplicate journeys or multiple active journeys in backup.');
 return journeys.sort((a,b)=>b.startedAt-a.startedAt);
}
export function mergeJourneys(existing,incoming){
 const byId=new Map(incoming.map(j=>[j.id,j]));existing.forEach(j=>byId.set(j.id,j));
 return validateJourneys({app:'Parkpin Explore',version:1,journeys:[...byId.values()]});
}
