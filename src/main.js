import './style.css';
import {initParkingSheet} from './sheet.js';
initParkingSheet();
import {distance,formatDistance} from './geo.js';
import {HISTORY_KEY,MAX_RECORDS,loadHistory,validateHistory,mergeHistory,formatDuration,arrivalState} from './history.js';
const $=id=>document.getElementById(id);
const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
const write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);return true}catch{return false}};
let token=read('parkpin-token')||import.meta.env.VITE_MAPBOX_TOKEN||'';
let records=[],storageError=false,spot=null,completion=null,arrivalCandidate=null,historyMarker;
try{records=loadHistory(localStorage);spot=records.find(p=>p.endedAt===null)||null;}catch{storageError=true;}
function persist(next){
 if(storageError){feedback('Parking storage could not be read. Export a backup before repairing browser storage.');return false;}
 if(!write(HISTORY_KEY,JSON.stringify({version:1,records:next}))){feedback('Could not save parking history. Browser storage may be full or unavailable. Export a backup and free some space.');return false;}
 records=next;spot=records.find(p=>p.endedAt===null)||null;return true;
}

let map,userMarker,parkingMarker,current,watchId,route,controller,lastRouteAt=0,lastRouteFrom,follow=false,is3D=true,mapReady=false,installPrompt;
const feedback=t=>$('feedback').textContent=t;
function fresh(){return current&&Date.now()-current.time<30000;}
function render(){const saved=!!spot;document.querySelector('.parking-card').classList.toggle('has-parking',saved);$('saved-info').hidden=!saved;$('save').hidden=saved;$('parking-actions').hidden=!saved;$('card-label').textContent=saved?'A SPOT WORTH REMEMBERING':'ONE LESS THING TO REMEMBER';$('card-title').innerHTML=saved?'Go wherever.<br>Get back easily.':'Park it. Pin it.<br>Go explore.';$('card-description').textContent=saved?'Your car is right where you left it.':'Save your spot. We’ll help you find your way back.';if(spot)$('saved-time').textContent=`Parked ${dateTime(spot.time)}`;$('route-summary').hidden=!route;$('steps-toggle').hidden=!route;$('footer-state').textContent=saved?'Parking saved':'Ready when you are';$('history-count').textContent=records.length;renderTimer();renderHistory();}
function openSettings(){ $('token').value=token;$('settings-dialog').showModal(); }
$('settings').onclick=openSettings;$('connect').onclick=openSettings;$('close-settings').onclick=()=>$('settings-dialog').close();
$('settings-form').onsubmit=e=>{e.preventDefault();const t=$('token').value.trim();if(!t.startsWith('pk.')){$('token-error').textContent='Please use a public token starting with pk.';return;}token=t;write('parkpin-token',token);$('token-error').textContent='';$('settings-dialog').close();initMap();};
function initMap(){controller?.abort();mapReady=false;userMarker=null;parkingMarker=null;if(map)map.remove();if(!window.mapboxgl){feedback('Map library could not load. Check your connection and reload.');return;}try{map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/standard',accessToken:token,center:current?.coords||spot?.coords||[77.5946,12.9716],zoom:16.7,pitch:55,bearing:-18,config:{basemap:{lightPreset:'day',showPointOfInterestLabels:false}},attributionControl:true});map.on('load',()=>{mapReady=true;$('map-placeholder').hidden=true;map.addSource('walking-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'walking-route-outline',type:'line',source:'walking-route',slot:'middle',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':9}});map.addLayer({id:'walking-route',type:'line',source:'walking-route',slot:'middle',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#658d42','line-width':5}});syncMarkers();drawRoute();if(spot&&current)updateRoute(true);});map.on('dragstart',()=>{follow=false});map.on('error',e=>{if(e.error?.status===401||e.error?.status===403)feedback('Mapbox rejected the token. Check the token and its allowed URLs in Settings.');else if(!mapReady)feedback('Map could not load. Check your connection and Mapbox token.');});}catch{feedback('3D maps need WebGL enabled in your browser. Try Android Chrome.');}}
function marker(cls,text){let el=document.createElement('div');el.className=cls;el.textContent=text;return new mapboxgl.Marker({element:el});}
function syncMarkers(){if(!mapReady)return;if(current){if(!userMarker)userMarker=marker('user-marker','');userMarker.setLngLat(current.coords).addTo(map);}if(spot){if(!parkingMarker)parkingMarker=marker('parking-marker','P');parkingMarker.setLngLat(spot.coords).addTo(map);}else{parkingMarker?.remove();parkingMarker=null;}}
function startLocation(){if(!isSecureContext){feedback('Location needs HTTPS. Open the hosted app on your phone.');return;}if(!navigator.geolocation){feedback('This browser does not support location.');return;}if(watchId!==undefined)navigator.geolocation.clearWatch(watchId);$('location-status').textContent='Finding your location…';watchId=navigator.geolocation.watchPosition(p=>{const first=!current;current={coords:[p.coords.longitude,p.coords.latitude],accuracy:p.coords.accuracy,time:p.timestamp,heading:p.coords.heading};$('status-dot').className='live';$('location-status').textContent=`Live location · ±${Math.round(current.accuracy)} m`;if(!spot&&!completion&&!storageError)feedback(current.accuracy>50?'GPS accuracy is low. Move outdoors for a more precise parking pin.':'You’re here. Save your spot before you head out.');checkArrival();syncMarkers();if(mapReady&&(first||follow))map.easeTo({center:current.coords,zoom:17,pitch:is3D?55:0,...(follow&&Number.isFinite(current.heading)?{bearing:current.heading}:{})});if(spot)updateRoute();},e=>{$('status-dot').className='';$('location-status').textContent='Location unavailable';feedback(e.code===1?'Allow location in your browser’s site settings, then tap the locate button.':e.code===3?'GPS timed out. Move outdoors and tap locate to try again.':'Unable to get your location. Turn on device location and try again.');},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});}
$('locate').onclick=()=>{follow=true;if(!fresh())startLocation();else if(mapReady)map.flyTo({center:current.coords,zoom:17,pitch:is3D?55:0});};
$('tilt').onclick=()=>{is3D=!is3D;$('tilt').textContent=is3D?'3D':'2D';$('tilt').classList.toggle('active',is3D);$('tilt').setAttribute('aria-pressed',String(is3D));map?.easeTo({pitch:is3D?55:0,bearing:is3D?-18:0});};$('zoom-in').onclick=()=>map?.zoomIn();$('zoom-out').onclick=()=>map?.zoomOut();
$('save').onclick=()=>{if(!fresh()){feedback('Waiting for a fresh GPS position. Tap Save parking again once located.');startLocation();return;}if(current.accuracy>100){feedback('GPS accuracy is over 100 m. Move outdoors and wait for a better fix before saving.');return;}if(records.length>=MAX_RECORDS){feedback('History has reached 10,000 records. Export a backup before freeing browser storage.');return;}const next={id:crypto.randomUUID(),coords:[...current.coords],time:Date.now(),accuracy:current.accuracy,hasLeft:false,endedAt:null,endReason:null};if(!persist([next,...records]))return;completion=null;arrivalCandidate=null;historyMarker?.remove();historyMarker=null;lastRouteFrom=null;route=null;render();syncMarkers();feedback('Parking saved. Your walking route will update as you move away.');updateRoute(true);};

function drawRoute(){if(mapReady)map.getSource('walking-route')?.setData(route?{type:'Feature',properties:{},geometry:route.geometry}:{type:'FeatureCollection',features:[]});}
async function updateRoute(force=false){if(!spot||!fresh())return;const now=Date.now();if(!force&&(now-lastRouteAt<15000||(lastRouteFrom&&distance(lastRouteFrom,current.coords)<15)))return;controller?.abort();controller=null;lastRouteAt=now;lastRouteFrom=[...current.coords];if(distance(current.coords,spot.coords)<12){route=null;render();drawRoute();$('steps').hidden=true;feedback('You’re at your parking spot. Directions appear as you move away.');return;}if(!token){feedback('Parking saved. Connect Mapbox in Settings for walking directions.');return;}const active=new AbortController();controller=active;route=null;render();drawRoute();$('steps').hidden=true;feedback('Finding your walking route…');try{const coordinates=`${current.coords.join(',')};${spot.coords.join(',')}`;const response=await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(token)}`,{signal:active.signal});const data=await response.json();if(!response.ok)throw Error(response.status===401||response.status===403?'Check your Mapbox token in Settings.':response.status===429?'Mapbox request limit reached. Try again later.':'Directions are unavailable. Try again when connected.');if(data.code!=='Ok'||!data.routes?.length)throw Error('No walking route was found here. Try again from a nearby street.');if(controller!==active||!spot)return;route=data.routes[0];$('route-minutes').textContent=Math.max(1,Math.ceil(route.duration/60));$('route-distance').textContent=formatDistance(route.distance);$('steps').replaceChildren(...route.legs.flatMap(l=>l.steps).map(s=>{const li=document.createElement('li');li.textContent=`${s.maneuver.instruction}${s.distance>0?' · '+formatDistance(s.distance):''}`;return li;}));render();drawRoute();feedback('Follow the green walking route back to your car.');if(force&&mapReady&&!follow){const bounds=new mapboxgl.LngLatBounds();route.geometry.coordinates.forEach(c=>bounds.extend(c));const mobile=innerWidth<=600;map.fitBounds(bounds,{padding:mobile?{top:140,bottom:Math.min(innerHeight*.58,440),left:50,right:65}:{top:150,bottom:90,left:440,right:100},maxZoom:18,pitch:is3D?55:0});}}catch(e){if(e.name!=='AbortError')feedback(e.message||'Walking directions are unavailable. Check your connection.');}}
$('walk').onclick=()=>{if(!fresh()){startLocation();feedback('Waiting for your current location to calculate the walk.');return;}follow=false;updateRoute(true);};
$('clear').onclick=()=>{if(confirm('End this parking session? It will stay in your history.'))finishParking('manual');};
$('steps-toggle').onclick=()=>{$('steps').hidden=!$('steps').hidden;$('steps-toggle').innerHTML=$('steps').hidden?'View walking directions <span>↓</span>':'Hide walking directions <span>↑</span>';};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});$('install').onclick=async()=>{await installPrompt?.prompt();installPrompt=null;$('install').hidden=true;};
addEventListener('online',()=>{feedback('Back online. Refreshing directions…');updateRoute(true);});addEventListener('offline',()=>feedback('You’re offline. Your saved parking spot is safe; maps and route updates need internet.'));
setInterval(()=>{renderTimer();if($('history-dialog').open)renderHistory();if(spot&&fresh())updateRoute();if(current&&!fresh()){$('status-dot').className='';$('location-status').textContent='Waiting for fresh GPS';}},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)startLocation();});

function dateTime(time){return new Date(time).toLocaleString([],{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function renderTimer(){
 const record=spot||completion;$('parking-timer').hidden=!record;if(!record)return;
 $('timer-label').textContent=spot?'PARKED FOR':record.endReason==='returned'?'WELCOME BACK · TOTAL PARKING TIME':'TOTAL PARKING TIME';
 $('timer-value').textContent=formatDuration(record.time,record.endedAt??Date.now());
 $('timer-detail').textContent=spot?'Return time is detected while the app is open.':`Ended ${dateTime(record.endedAt)} · Saved in history`;
}
function finishParking(reason){
 if(!spot)return false;const finished={...spot,endedAt:Math.max(Date.now(),spot.time),endReason:reason};
 if(!persist(records.map(p=>p.id===finished.id?finished:p)))return false;
 completion=finished;arrivalCandidate=null;controller?.abort();controller=null;route=null;lastRouteFrom=null;follow=false;$('steps').hidden=true;render();drawRoute();syncMarkers();
 feedback(reason==='returned'?`Welcome back! Total parking time: ${formatDuration(finished.time,finished.endedAt)}.`:'Parking ended and saved to your history.');return true;
}
function checkArrival(){
 if(!spot)return;const next=arrivalState(spot,current,arrivalCandidate);arrivalCandidate=next.candidate;
 if(next.hasLeft!==spot.hasLeft){const changed={...spot,hasLeft:true};if(!persist(records.map(p=>p.id===changed.id?changed:p)))return;}
 if(next.arrived)finishParking('returned');
}
function renderHistory(){
 const list=$('history-list');list.replaceChildren();
 if(!records.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='Your next parking spot starts your history. Save a spot to get going.';list.append(empty);return;}
 let previousDate='';
 for(const record of [...records].sort((a,b)=>b.time-a.time)){
  const date=new Date(record.time).toLocaleDateString([],{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  if(date!==previousDate){const heading=document.createElement('h3');heading.textContent=date;list.append(heading);previousDate=date;}
  const item=document.createElement('article');item.className='history-item';
  const title=document.createElement('strong');title.textContent=new Date(record.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' · '+(record.endedAt===null?'Currently parked':record.endReason==='returned'?'Returned to car':'Parking ended');
  const coords=document.createElement('p');coords.textContent=`${record.coords[1].toFixed(5)}, ${record.coords[0].toFixed(5)} · GPS ±${Math.round(record.accuracy)} m`;
  const period=document.createElement('p');period.textContent=`From ${dateTime(record.time)}${record.endedAt!==null?' to '+dateTime(record.endedAt):' · In progress'}`;
  const footer=document.createElement('div');footer.className='history-item-footer';const duration=document.createElement('b');duration.textContent=formatDuration(record.time,record.endedAt??Date.now());
  const view=document.createElement('button');view.className='text-button';view.textContent='View spot ↗';view.onclick=()=>{if(!mapReady){$('history-feedback').textContent='Wait for the map to load, or check your token in Settings.';return;}historyMarker?.remove();historyMarker=marker('parking-marker','P').setLngLat(record.coords).addTo(map);follow=false;map.flyTo({center:record.coords,zoom:17,pitch:is3D?55:0});$('history-dialog').close();};
  footer.append(duration,view);item.append(title,coords,period,footer);list.append(item);
 }
}
$('history').onclick=()=>{renderHistory();$('history-feedback').textContent=storageError?'Storage could not be read. Export preserves the raw data for recovery.':'';$('history-dialog').showModal();};
$('close-history').onclick=()=>$('history-dialog').close();
$('export-history').onclick=()=>{
 const backup=storageError?read(HISTORY_KEY):JSON.stringify({app:'Parkpin',version:1,exportedAt:new Date().toISOString(),records},null,2);
 if(!backup){$('history-feedback').textContent='No readable parking data is available to export.';return;}
 const url=URL.createObjectURL(new Blob([backup],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`parkpin-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('history-feedback').textContent='Parking backup exported. Keep this file to restore your history.';
};
$('import-history').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(storageError)throw Error('Existing parking data could not be read. Export it before repairing browser storage.');
  if(file.size>5*1024*1024)throw Error('Backup is too large. Choose a JSON file under 5 MB.');
  let data;try{data=JSON.parse(await file.text());}catch{throw Error('This file is not valid JSON. Choose a Parkpin export.');}
  const incoming=validateHistory(data),merged=mergeHistory(records,incoming),added=merged.length-records.length;
  if(!persist(merged))throw Error('Import could not be saved. Existing parking data was kept.');
  controller?.abort();controller=null;route=null;arrivalCandidate=null;lastRouteFrom=null;completion=null;render();syncMarkers();drawRoute();if(spot)updateRoute(true);
  $('history-feedback').textContent=`Imported ${added} parking ${added===1?'record':'records'}. ${incoming.length-added} already saved. ${records.length} total.`;
 }catch(error){$('history-feedback').textContent=error.message;}finally{e.target.value='';}
};
// Refresh shared history if another tab saves or ends parking.
addEventListener('storage',e=>{if(e.key!==HISTORY_KEY)return;try{records=loadHistory(localStorage);spot=records.find(p=>p.endedAt===null)||null;storageError=false;completion=null;arrivalCandidate=null;controller?.abort();controller=null;route=null;lastRouteFrom=null;render();drawRoute();syncMarkers();if(spot)updateRoute(true);}catch{storageError=true;feedback('Parking data changed but could not be read. Export a backup from History.');}});
render();if(storageError)feedback('Parking storage could not be read. Export a backup from History before repairing browser storage.');if(token)initMap();startLocation();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
