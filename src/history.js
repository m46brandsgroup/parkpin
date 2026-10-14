import {distance,validSpot} from './geo.js';
import {MAX_TRACK_POINTS} from './navigation.js';
export const HISTORY_KEY='parkpin-history';
export const MAX_RECORDS=10000;
export function normalizeRecord(p){
 if(!validSpot(p)||!Number.isSafeInteger(p.time)||p.time<0||p.time>Date.now()+300000||typeof p.id!=='string'||!p.id.length||p.id.length>128||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>100000||typeof p.hasLeft!=='boolean'||!(p.endedAt===null||(Number.isSafeInteger(p.endedAt)&&p.endedAt>=p.time&&p.endedAt<=Date.now()+300000))||!['returned','manual',null].includes(p.endReason)||(p.endedAt===null)!==(p.endReason===null))throw Error('Invalid parking record. Import a Parkpin JSON export.');
 const track=p.track??[];
 if(!Array.isArray(track)||track.length>MAX_TRACK_POINTS)throw Error('Invalid recorded track.');
 let lastTime=p.time-1;
 const points=track.map(point=>{
  if(!validSpot(point)||!Number.isSafeInteger(point.time)||point.time<lastTime||point.time<p.time||point.time>(p.endedAt??Date.now()+300000)||!Number.isFinite(point.accuracy)||point.accuracy<0||point.accuracy>100000)throw Error('Invalid recorded track.');
  lastTime=point.time;return {coords:[...point.coords],time:point.time,accuracy:point.accuracy};
 });
 return {track:points,id:p.id,coords:[...p.coords],time:p.time,accuracy:p.accuracy,hasLeft:p.hasLeft,endedAt:p.endedAt,endReason:p.endReason};
}
export function validateHistory(data){
 if(!data||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX_RECORDS)throw Error('Unsupported backup. Use a Parkpin version 1 JSON export (up to 10,000 records).');
 const records=data.records.map(normalizeRecord);
 if(new Set(records.map(p=>p.id)).size!==records.length)throw Error('Backup contains duplicate parking IDs.');
 if(records.filter(p=>p.endedAt===null).length>1)throw Error('Only one parking session can be active. End the current session before importing another active session.');
 return records.sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id));
}
export function mergeHistory(existing,incoming){
 const byId=new Map(incoming.map(p=>[p.id,p]));
 // Existing records win: an old export must never reopen a completed visit.
 existing.forEach(p=>byId.set(p.id,p));
 return validateHistory({version:1,records:[...byId.values()]});
}
export function loadHistory(storage){
 const raw=storage.getItem(HISTORY_KEY);
 if(raw!==null)return validateHistory(JSON.parse(raw));
 const legacy=JSON.parse(storage.getItem('parkpin-spot')||'null');
 if(!validSpot(legacy))return [];
 const records=validateHistory({version:1,records:[{id:`legacy-${legacy.time}`,coords:legacy.coords,time:legacy.time,accuracy:legacy.accuracy??100,hasLeft:false,endedAt:null,endReason:null}]});
 storage.setItem(HISTORY_KEY,JSON.stringify({version:1,records}));
 storage.removeItem('parkpin-spot');
 return records;
}
export function formatDuration(start,end=Date.now()){
 const seconds=Math.max(0,Math.floor((end-start)/1000));
 if(seconds<60)return `${seconds} sec`;
 const minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 return [days?`${days}d`:null,hours%24?`${hours%24}h`:null,minutes%60?`${minutes%60}m`:null].filter(Boolean).join(' ');
}
export function arrivalState(spot,position,candidate=null){
 if(!position||position.time<spot.time||Date.now()-position.time>30000||!Number.isFinite(position.accuracy)||position.accuracy>35)return {hasLeft:spot.hasLeft,candidate:null,arrived:false};
 const metres=distance(spot.coords,position.coords);
 const hasLeft=spot.hasLeft||metres>Math.max(50,spot.accuracy+position.accuracy);
 if(!spot.hasLeft||metres>20)return {hasLeft,candidate:null,arrived:false};
 const since=candidate??position.time;
 return {hasLeft,candidate:since,arrived:position.time-since>=8000};
}
