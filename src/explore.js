import {EXPLORE_KEY,validateJourneys,mergeJourneys,journeyDistance} from './explore-data.js';
import {formatDuration} from './history.js';
export function initExplore(onPosition){
 const $=id=>document.getElementById(id);
 let journeys=[],broken=false,pending=false,generation=0,starting=false,lastSaved=0;
 const active=()=>journeys.find(j=>j.endedAt===null);
 const message=t=>$('explore-status').textContent=t;
 const payload=items=>({app:'Parkpin Explore',version:1,journeys:items});
 try{const raw=localStorage.getItem(EXPLORE_KEY);if(raw)journeys=validateJourneys(JSON.parse(raw));}catch{broken=true;message('Journey storage could not be read. Export it for recovery before repairing storage.');}
 function save(next){
  if(broken)return false;
  try{localStorage.setItem(EXPLORE_KEY,JSON.stringify(payload(next)));journeys=next;return true;}
  catch{message('Journey could not be saved. Storage may be full or unavailable. Export a backup and free device storage.');return false;}
 }
 const date=t=>new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
 function renderList(){
  $('explore-list').replaceChildren();
  if(!journeys.length){const p=document.createElement('p');p.textContent='Your journeys will appear here, newest first.';$('explore-list').append(p);}
  let previousDay='',group;
  for(const j of [...journeys].sort((a,b)=>b.startedAt-a.startedAt)){
   const day=new Date(j.startedAt).toLocaleDateString([],{weekday:'short',year:'numeric',month:'long',day:'numeric'});
   if(day!==previousDay){
    group=document.createElement('section');group.className='explore-day';
    const heading=document.createElement('h4');heading.textContent=day;
    group.append(heading);$('explore-list').append(group);previousDay=day;
   }
   const item=document.createElement('article');item.className='history-item';
   const title=document.createElement('strong');title.textContent=new Date(j.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
   const summary=document.createElement('p');summary.textContent=`${(journeyDistance(j.points)/1000).toFixed(2)} km · ${formatDuration(j.startedAt,j.endedAt??Date.now())} · ${j.endedAt===null?'Recording':`Ended ${date(j.endedAt)}`}`;
   const brief=document.createElement('p');brief.textContent=j.brief||`Journey with ${j.points.length} saved location updates. Distance is estimated from GPS; gaps are excluded.`;
   const details=document.createElement('details'),label=document.createElement('summary');label.textContent=`Location list · ${j.points.length} points`;details.append(label);
   details.addEventListener('toggle',()=>{if(!details.open||details.childElementCount>1)return;const list=document.createElement('ol');list.className='explore-points';for(const p of j.points.slice(-300).reverse()){const li=document.createElement('li');li.textContent=`${date(p.time)}:${String(new Date(p.time).getSeconds()).padStart(2,'0')} · ${p.coords[1].toFixed(5)}, ${p.coords[0].toFixed(5)} · ±${Math.round(p.accuracy)} m`;list.append(li);}details.append(list);if(j.points.length>300){const note=document.createElement('p');note.textContent='Showing the latest 300 points. Export includes every point.';details.append(note);}});
   item.append(title,summary,brief,details);group.append(item);
  }
 }
 function render(){
  const j=active();$('explore-start').hidden=!!j;$('explore-stop').hidden=!j;$('explore-start').disabled=broken||starting;
  $('explore-open').setAttribute('aria-label',j?'Explore journeys — recording':'Explore journeys');$('explore-open').title=j?'Explore journeys — recording':'Explore journeys';$('explore-open').classList.toggle('recording',!!j);
  $('explore-distance').textContent=`${(journeyDistance(j?.points||[])/1000).toFixed(2)} km`;
  $('explore-time').textContent=j?`${formatDuration(j.startedAt)} · ${j.points.length} points saved`:'Ready for your next journey';
 }
 function accept(p,id){
  const j=active();if(!j||j.id!==id)return;
  const time=Math.round(p.timestamp),last=j.points.at(-1);
  if(time<j.startedAt||Date.now()-time>5000||time>Date.now()+1000||last&&time-last.time<1000)return;
  if(j.points.length>=100000){message('Journey point limit reached. End this journey and start a new one.');return;}
  const point={coords:[p.coords.longitude,p.coords.latitude],time,accuracy:p.coords.accuracy};
  const next={...j,points:[...j.points,point]};
  if(save(journeys.map(x=>x.id===id?next:x))){lastSaved=Date.now();message(point.accuracy>50?'Recording · GPS accuracy is low; this point is excluded from distance.':'Recording · location saved on this device');onPosition(p);render();if($('explore-dialog').open&&!$('explore-list').querySelector('details[open]'))renderList();}
 }
 function sample(){
  const j=active();if(!j||pending||broken||document.hidden)return;
  if(!navigator.geolocation||!isSecureContext){message('Tracking needs HTTPS and a browser with location access.');return;}
  pending=true;const run=generation;
  navigator.geolocation.getCurrentPosition(p=>{pending=false;if(run===generation)accept(p,j.id);},e=>{pending=false;if(run===generation)message(e.code===1?'Location blocked. Allow location in your browser; recording retries automatically.':'Waiting for GPS. Your saved journey is safe; recording retries automatically.');},{enableHighAccuracy:true,maximumAge:0,timeout:10000});
 }
 $('explore-open').onclick=()=>{render();renderList();$('explore-dialog').showModal();};
 $('explore-close').onclick=()=>$('explore-dialog').close();
 $('explore-start').onclick=async()=>{
  if(starting||active()||broken)return;
  starting=true;render();message('Finding your location to start the journey…');
  try{
   if(!isSecureContext||!navigator.geolocation)throw Error('Use HTTPS and allow browser location access.');
   const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
   if(active())return;
   const time=Math.round(p.timestamp);if(Date.now()-time>5000)throw Error('GPS is stale. Please try again.');
   const j={id:crypto.randomUUID(),startedAt:time,endedAt:null,brief:$('explore-brief').value.trim(),points:[]};
   if(save([j,...journeys])){generation++;accept(p,j.id);renderList();}
  }catch(e){message(e.code===1?'Allow location access in your browser, then start again.':e.message||'Location unavailable. Try again.');}
  finally{starting=false;render();}
 };
 $('explore-stop').onclick=()=>{const j=active();if(!j)return;const end={...j,endedAt:Math.max(Date.now(),j.points.at(-1)?.time??j.startedAt),brief:$('explore-brief').value.trim()};if(save(journeys.map(x=>x.id===j.id?end:x))){generation++;message('Journey finished and saved on this device.');render();renderList();}};
 $('explore-brief').addEventListener('change',()=>{const j=active();if(j)save(journeys.map(x=>x.id===j.id?{...j,brief:$('explore-brief').value.trim()}:x));});
 $('explore-export').onclick=()=>{
  try{const raw=broken?localStorage.getItem(EXPLORE_KEY):JSON.stringify({...payload(journeys),exportedAt:new Date().toISOString()},null,2);if(!raw)throw Error('No readable data to export.');const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`parkpin-explore-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Journey backup exported.');}catch(e){message(e.message);}
 };
 $('explore-import').onclick=()=>$('explore-file').click();
 $('explore-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(broken)throw Error('Export unreadable storage for recovery before importing.');if(file.size>20*1024*1024)throw Error('Choose a backup smaller than 20 MB.');const incoming=validateJourneys(JSON.parse(await file.text()));
   // Imported recordings are archived, never silently start tracking location.
   const archived=incoming.map(j=>j.endedAt===null?{...j,endedAt:j.points.at(-1)?.time??j.startedAt}:j);
   const merged=mergeJourneys(journeys,archived);if(save(merged)){message('Journeys imported. Existing IDs were kept; imported active journeys were archived.');render();renderList();}
  }catch(e){message(e.message||'Could not import this backup.');}finally{e.target.value='';}
 };
 addEventListener('storage',e=>{if(e.key!==EXPLORE_KEY)return;try{journeys=e.newValue?validateJourneys(JSON.parse(e.newValue)):[];broken=false;generation++;$('explore-brief').value=active()?.brief||'';render();renderList();}catch{broken=true;message('Journey storage changed but could not be read. Export a recovery copy.');}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){sample();render();}});
 setInterval(()=>{sample();render();if(active()&&lastSaved&&Date.now()-lastSaved>15000)message('Waiting for fresh GPS. Recorded points are saved; gaps are not counted in distance.');},1000);
 $('explore-brief').value=active()?.brief||'';render();if(active()){message('Resuming your saved journey. Time away may contain tracking gaps.');sample();}
}
