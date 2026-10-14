import {createLocationDisplay} from './location-display.js';
import './style.css';
import {initParkingSheet} from './sheet.js';
initParkingSheet();
import {distance,formatDistance} from './geo.js';
import {appendTrack,fastestRoute,bearing,walkingGuidance} from './navigation.js';
import {HISTORY_KEY,MAX_RECORDS,loadHistory,validateHistory,mergeHistory,formatDuration,arrivalState} from './history.js';
const $=id=>document.getElementById(id);
const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
const write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);return true}catch{return false}};
const token=import.meta.env.VITE_MAPBOX_TOKEN||read('parkpin-token')||'';
let records=[],storageError=false,spot=null,completion=null,arrivalCandidate=null,historyMarker;
try{records=loadHistory(localStorage);spot=records.find(p=>p.endedAt===null)||null;}catch{storageError=true;}
function persist(next){
 if(storageError){feedback('Parking storage could not be read. Export a backup before repairing browser storage.');return false;}
 if(!write(HISTORY_KEY,JSON.stringify({version:1,records:next}))){feedback('Could not save parking history. Browser storage may be full or unavailable. Export a backup and free some space.');return false;}
 records=next;spot=records.find(p=>p.endedAt===null)||null;return true;
}

let map,userMarker,parkingMarker,current,watchId,route,controller,lastRouteAt=0,lastRouteFrom,follow=false,is3D=true,mapReady=false,installPrompt,navigating=!!spot,locating=false,mapNight=null;
const filterLocation=createLocationDisplay();
let displayPosition;
function updateCurrent(p){current={coords:[p.coords.longitude,p.coords.latitude],accuracy:p.coords.accuracy,time:p.timestamp,heading:p.coords.heading};displayPosition=filterLocation(current);}
const feedback=t=>$('feedback').textContent=t;
const gpsRequests=new Set();
function setGpsLoading(source,loading){if(loading)gpsRequests.add(source);else gpsRequests.delete(source);$('gps-loading').hidden=gpsRequests.size===0;}
function showLocationError(error){
 const title=error.code===1?'Location permission blocked':error.code===3?'Location request timed out':'Browser cannot provide location';
 const message=error.code===1?'Allow location for this site in your browser permissions, then retry.':error.code===3?'Your browser did not return a position within 20 seconds. Check device location services and retry.':'Your browser could not obtain a position from the device. Check that location services are enabled.';
 $('location-error-title').textContent=title;$('location-error-message').textContent=message;$('location-error').hidden=false;
 $('status-dot').className='';$('location-status').textContent=title;feedback(message);renderNavigation(title);
}
$('location-retry').onclick=()=>refreshPosition(!!spot);
function fresh(){return current&&Date.now()-current.time<30000;}
function render(){const saved=!!spot;document.querySelector('.parking-card').classList.toggle('has-parking',saved);$('saved-info').hidden=!saved;$('save').hidden=saved;$('parking-actions').hidden=!saved;$('card-label').textContent=saved?'A SPOT WORTH REMEMBERING':'ONE LESS THING TO REMEMBER';$('card-title').innerHTML=saved?'Go wherever.<br>Get back easily.':'Park it. Pin it.<br>Go explore.';$('card-description').textContent=saved?'Your car is right where you left it.':'Save your spot. We’ll help you find your way back.';if(spot)$('saved-time').textContent=`Parked ${dateTime(spot.time)}`;$('route-summary').hidden=!route;$('steps-toggle').hidden=!route;$('history-count').textContent=records.length;renderTimer();renderHistory();renderNavigation();}
function initMap(){controller?.abort();mapReady=false;userMarker=null;parkingMarker=null;mapNight=null;if(map)map.remove();if(!window.mapboxgl){feedback('Map library could not load. Check your connection and reload.');return;}try{map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/standard',accessToken:token,center:current?.coords||spot?.coords||[77.5946,12.9716],zoom:16.7,pitch:55,bearing:-18,config:{basemap:{lightPreset:navigating?'night':'day',showPointOfInterestLabels:false}},attributionControl:true});map.on('load',()=>{mapReady=true;$('map-placeholder').hidden=true;map.addSource('recorded-track',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'recorded-track',type:'line',source:'recorded-track',slot:'middle',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ba9be8','line-emissive-strength':1,'line-width':4,'line-dasharray':[1,1.6]}});drawTrack();map.addSource('walking-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'walking-route-outline',type:'line',source:'walking-route',slot:'middle',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#123a85','line-emissive-strength':1,'line-width':12}});map.addLayer({id:'walking-route',type:'line',source:'walking-route',slot:'middle',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#4385ff','line-emissive-strength':1,'line-width':7}});syncMarkers();drawRoute();renderNavigation();if(current&&follow)centerNavigation();if(spot&&current)updateRoute(true);});map.on('dragstart',()=>{follow=false;renderNavigation();});map.on('error',e=>{if(e.error?.status===401||e.error?.status===403)feedback('Map access is unavailable. Please contact the app owner.');else if(!mapReady)feedback('Map could not load. Check your connection and reload.');});}catch{feedback('3D maps need WebGL enabled in your browser. Try Android Chrome.');}}
function marker(cls,text){let el=document.createElement('div');el.className=cls;el.textContent=text;return new mapboxgl.Marker({element:el});}
function syncMarkers(){if(!mapReady)return;if(current){if(!userMarker)userMarker=marker('user-marker','');userMarker.setLngLat(displayPosition?.coords||current.coords).addTo(map);}if(spot){if(!parkingMarker)parkingMarker=marker('parking-marker','P');parkingMarker.setLngLat(spot.coords).addTo(map);}else{parkingMarker?.remove();parkingMarker=null;}}
function startLocation(){if(!isSecureContext){feedback('Location needs HTTPS. Open the hosted app on your phone.');return;}if(!navigator.geolocation){feedback('This browser does not support location.');return;}if(watchId!==undefined)return;if(!fresh())$('location-status').textContent='Finding your location…';setGpsLoading('watch',!fresh());watchId=navigator.geolocation.watchPosition(p=>{$('location-error').hidden=true;setGpsLoading('watch',false);const first=!current;updateCurrent(p);$('status-dot').className='live';$('location-status').textContent=`Live location · ±${Math.round(current.accuracy)} m`;if(!spot&&!completion&&!storageError)feedback(current.accuracy>50?'GPS accuracy is low. Move outdoors for a more precise parking pin.':'You’re here. Save your spot before you head out.');recordTrack();checkArrival();syncMarkers();renderNavigation();if(mapReady&&(first||follow))centerNavigation();if(spot)updateRoute(!!route&&walkingGuidance(route,current)?.offRoute&&Date.now()-lastRouteAt>=5000);},e=>{setGpsLoading('watch',false);if(e.code===1){navigator.geolocation.clearWatch(watchId);watchId=undefined;}showLocationError(e);},{enableHighAccuracy:true,maximumAge:0,timeout:20000});}
$('locate').onclick=()=>refreshPosition(!!spot);
$('tilt').onclick=()=>{is3D=!is3D;$('tilt').textContent=is3D?'3D':'2D';$('tilt').classList.toggle('active',is3D);$('tilt').setAttribute('aria-pressed',String(is3D));map?.easeTo({pitch:is3D?55:0,bearing:is3D?-18:0});};$('zoom-in').onclick=()=>map?.zoomIn();$('zoom-out').onclick=()=>map?.zoomOut();
$('save').onclick=async()=>{if(spot||!await refreshPosition(false)||spot)return;if(current.accuracy>100){feedback('GPS accuracy is over 100 m. Move outdoors and wait for a better fix before saving.');return;}if(records.length>=MAX_RECORDS){feedback('History has reached 10,000 records. Export a backup before freeing browser storage.');return;}const next={id:crypto.randomUUID(),coords:[...current.coords],time:Date.now(),accuracy:current.accuracy,hasLeft:false,endedAt:null,endReason:null,track:[]};next.track=[{coords:[...next.coords],time:next.time,accuracy:next.accuracy}];if(!persist([next,...records]))return;completion=null;arrivalCandidate=null;historyMarker?.remove();historyMarker=null;lastRouteFrom=null;route=null;navigating=true;follow=true;is3D=true;render();syncMarkers();drawTrack();centerNavigation();feedback('Parking saved. Tracking your route and live walking directions.');updateRoute(true);};

function drawRoute(){if(mapReady)map.getSource('walking-route')?.setData(route?{type:'Feature',properties:{},geometry:route.geometry}:{type:'FeatureCollection',features:[]});}
async function updateRoute(force=false){if(!spot||!fresh())return;if(current.accuracy>50){renderNavigation('Waiting for a more accurate GPS position…');return;}const now=Date.now();if(!force&&(now-lastRouteAt<10000||(lastRouteFrom&&distance(lastRouteFrom,current.coords)<8)))return;controller?.abort();controller=null;lastRouteAt=now;lastRouteFrom=[...current.coords];if(distance(current.coords,spot.coords)<12){route=null;render();drawRoute();$('steps').hidden=true;feedback('Parking saved. Tracking your walk; the route back appears as you move away.');renderNavigation();return;}if(!token){feedback('Parking saved. Walking directions are not configured yet.');return;}const active=new AbortController();controller=active;renderNavigation(route?'Updating route from your latest position…':'Finding the fastest walking route…');feedback('Finding your walking route…');try{const coordinates=`${current.coords.join(',')};${spot.coords.join(',')}`;const response=await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&overview=full&steps=true&alternatives=true&access_token=${encodeURIComponent(token)}`,{signal:active.signal});const data=await response.json();if(!response.ok)throw Error(response.status===401||response.status===403?'Directions access is unavailable. Please contact the app owner.':response.status===429?'Mapbox request limit reached. Try again later.':'Directions are unavailable. Try again when connected.');if(data.code!=='Ok'||!data.routes?.length)throw Error('No walking route was found here. Try again from a nearby street.');if(controller!==active||!spot)return;route=fastestRoute(data.routes);if(!route)throw Error('No usable walking route was found.');$('route-minutes').textContent=Math.max(1,Math.ceil(route.duration/60));$('route-distance').textContent=formatDistance(route.distance);$('steps').replaceChildren(...route.legs.flatMap(l=>l.steps).map(s=>{const li=document.createElement('li');li.textContent=`${s.maneuver.instruction}${s.distance>0?' · '+formatDistance(s.distance):''}`;return li;}));render();drawRoute();if(navigating&&follow)centerNavigation();feedback('Follow the blue walking route back to your car.');if(force&&mapReady&&!follow){const bounds=new mapboxgl.LngLatBounds();route.geometry.coordinates.forEach(c=>bounds.extend(c));const mobile=innerWidth<=600;map.fitBounds(bounds,{padding:mobile?{top:140,bottom:Math.min(innerHeight*.58,440),left:50,right:65}:{top:150,bottom:90,left:440,right:100},maxZoom:18,pitch:is3D?55:0});}}catch(e){if(e.name!=='AbortError'){route=null;drawRoute();render();$('steps').hidden=true;feedback(e.message||'Walking directions are unavailable. Check your connection.');renderNavigation(e.message||'Directions unavailable.');}}}
$('walk').onclick=()=>refreshPosition(true);
$('exit-navigation').onclick=()=>{navigating=false;follow=false;renderNavigation();};
$('clear').onclick=()=>{if(confirm('End this parking session? It will stay in your history.'))finishParking('manual');};
$('steps-toggle').onclick=()=>{$('steps').hidden=!$('steps').hidden;$('steps-toggle').innerHTML=$('steps').hidden?'View walking directions <span>↓</span>':'Hide walking directions <span>↑</span>';};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});$('install').onclick=async()=>{await installPrompt?.prompt();installPrompt=null;$('install').hidden=true;};
addEventListener('online',()=>{feedback('Back online. Refreshing directions…');updateRoute(true);});addEventListener('offline',()=>feedback('You’re offline. Your saved parking spot is safe; maps and route updates need internet.'));
setInterval(()=>{renderTimer();if(!fresh())renderNavigation('GPS is stale. Tap Track my route to locate again.');if($('history-dialog').open)renderHistory();if(spot&&fresh())updateRoute();if(current&&!fresh()){$('status-dot').className='';$('location-status').textContent='Waiting for fresh GPS';}},5000);
// Keep the existing watch across tab switches; restarting it repeatedly flashes the GPS prompt.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&watchId===undefined)startLocation();});

function renderNavigation(message){
 const visible=navigating&&!!spot;if(visible){$('tilt').textContent=is3D?'3D':'2D';$('tilt').classList.toggle('active',is3D);$('tilt').setAttribute('aria-pressed',String(is3D));}document.body.classList.toggle('is-navigating',visible);$('navigation-banner').hidden=!visible;$('navigation-tools').hidden=!visible;if(mapReady&&mapNight!==visible){map.setConfigProperty?.('basemap','lightPreset',visible?'night':'day');mapNight=visible;}
 $('walk-label').textContent=locating?'Checking live position…':visible&&follow?'Tracking my route · refresh':'Track my route';
 if(!visible)return;
 const steps=route?.legs?.[0]?.steps||[],step=steps[0],guidance=walkingGuidance(route,current),next=guidance?.step||steps[1]||step;
 $('navigation-status').textContent=follow?'PARKING SAVED · LIVE NAVIGATION':'MAP MOVED · TAP TRACK MY ROUTE TO FOLLOW';
 $('navigation-instruction').textContent=message||(guidance?.offRoute?'Off route — finding a new walking path…':null)||(!fresh()?'Waiting for a fresh GPS position…':current.accuracy>50?'Waiting for a more accurate GPS position…':null)||(next?.maneuver?.instruction)||'Walk away to see the route back.';
 $('navigation-detail').textContent=route?`${Math.max(1,Math.ceil(route.duration/60))} min · ${formatDistance(route.distance)} to your car${step?.distance?' · Next instruction in '+formatDistance(step.distance):''}`:'Your walk is recorded on this device while the app is open.';
 const distanceLabel=guidance?formatDistance(guidance.distance):'Ready';
 $('maneuver-distance').textContent=message?'Locating…':distanceLabel;
 $('maneuver-icon').textContent=maneuverSymbol(next?.maneuver);
 $('upcoming-turns').replaceChildren();
 for(const instruction of steps.slice(Math.max(1,steps.indexOf(next)),Math.max(1,steps.indexOf(next))+4)){
  const arrow=document.createElement('span');arrow.textContent=maneuverSymbol(instruction.maneuver);arrow.title=instruction.maneuver.instruction;arrow.setAttribute('aria-label',instruction.maneuver.instruction);$('upcoming-turns').append(arrow);
 }
 if(steps.length<2){const label=document.createElement('span');label.className='upcoming-label';label.textContent=route?'Follow the highlighted walking path':'Live GPS · Route updates as you walk';$('upcoming-turns').append(label);}
 $('arrival-time').textContent=route?new Date(Date.now()+(guidance?.duration??route.duration)*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Your car is pinned';
 $('arrival-stats').textContent=route?`${Math.max(1,Math.ceil((guidance?.duration??route.duration)/60))} min · ${formatDistance(guidance?.remaining??route.distance)}`:'Walk away to start navigation';


}
function maneuverSymbol(maneuver){
 const modifier=maneuver?.modifier||'';
 if(maneuver?.type==='arrive')return '⚑';
 if(modifier.includes('uturn'))return '↶';
 if(modifier.includes('left'))return modifier.includes('slight')?'↖':'↰';
 if(modifier.includes('right'))return modifier.includes('slight')?'↗':'↱';
 return '↑';
}
$('nav-recenter').onclick=()=>refreshPosition(true);
$('nav-history').onclick=()=>$('history').click();
$('nav-details-toggle').onclick=()=>{const expanded=document.body.classList.toggle('navigation-expanded');$('nav-details-toggle').setAttribute('aria-expanded',String(expanded));$('nav-details-toggle').setAttribute('aria-label',expanded?'Hide parking details':'Show parking details');$('nav-details-toggle').textContent=expanded?'⌄':'⌃';};
function centerNavigation(){
 if(!mapReady||!current)return;
 const points=route?.geometry?.coordinates;
 const heading=displayPosition?.heading??(points?.length>1?bearing(points[0],points[1]):0);
 map.easeTo({center:displayPosition?.coords||current.coords,zoom:navigating?18:17,pitch:is3D?(navigating?65:55):0,bearing:navigating?heading:0,offset:navigating?[innerWidth>600?160:15,innerHeight<500?35:80]:[0,0],duration:700});
}
function drawTrack(record=spot||completion){
 const points=record?.track||[];
 if(mapReady)map.getSource('recorded-track')?.setData(points.length>1?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points.map(p=>p.coords)}}:{type:'FeatureCollection',features:[]});
}
function recordTrack(){
 if(!spot||!fresh())return;
 const previous=spot.track||[],track=appendTrack(previous,current);if(track===previous)return;
 const changed={...spot,track};if(persist(records.map(p=>p.id===changed.id?changed:p)))drawTrack();
}
async function refreshPosition(navigate){
 if(locating)return false;
 if(!isSecureContext||!navigator.geolocation){feedback('Live GPS needs HTTPS and browser location permission.');return false;}
 locating=true;$('location-error').hidden=true;setGpsLoading('manual',true);feedback('Checking your current GPS position…');$('save').disabled=true;$('walk').disabled=true;renderNavigation('Checking your current GPS position…');
 try{
  const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
  setGpsLoading('manual',false);setGpsLoading('watch',false);$('location-error').hidden=true;
  updateCurrent(p);
  $('status-dot').className='live';$('location-status').textContent=`Live location · ±${Math.round(current.accuracy)} m`;follow=true;
  if(navigate&&spot){navigating=true;follow=true;is3D=true;recordTrack();checkArrival();}
  syncMarkers();centerNavigation();if(watchId===undefined)startLocation();if(navigate&&spot)await updateRoute(true);return true;
 }catch(error){showLocationError(error);return false;}
 finally{setGpsLoading('manual',false);locating=false;$('save').disabled=false;$('walk').disabled=false;$('walk-label').textContent=navigating&&follow?'Tracking my route · refresh':'Track my route';}
}
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
 completion=finished;navigating=false;arrivalCandidate=null;controller?.abort();controller=null;route=null;lastRouteFrom=null;follow=false;$('steps').hidden=true;render();drawRoute();drawTrack();syncMarkers();
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
  const period=document.createElement('p');period.textContent=`From ${dateTime(record.time)}${record.endedAt!==null?' to '+dateTime(record.endedAt):' · In progress'} · ${record.track?.length||0} track points`;
  const footer=document.createElement('div');footer.className='history-item-footer';const duration=document.createElement('b');duration.textContent=formatDuration(record.time,record.endedAt??Date.now());
  const view=document.createElement('button');view.className='text-button';view.textContent='View spot ↗';view.onclick=()=>{if(!mapReady){$('history-feedback').textContent='Wait for the map to load, or check your connection.';return;}historyMarker?.remove();historyMarker=marker('parking-marker','P').setLngLat(record.coords).addTo(map);follow=false;navigating=false;renderNavigation();drawTrack(record);map.flyTo({center:record.coords,zoom:17,pitch:is3D?55:0});$('history-dialog').close();};
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
  controller?.abort();controller=null;route=null;arrivalCandidate=null;lastRouteFrom=null;completion=null;navigating=!!spot;follow=!!spot;render();syncMarkers();drawRoute();drawTrack();if(spot)updateRoute(true);
  $('history-feedback').textContent=`Imported ${added} parking ${added===1?'record':'records'}. ${incoming.length-added} already saved. ${records.length} total.`;
 }catch(error){$('history-feedback').textContent=error.message;}finally{e.target.value='';}
};
// Refresh shared history if another tab saves or ends parking.
addEventListener('storage',e=>{if(e.key!==HISTORY_KEY)return;try{records=loadHistory(localStorage);spot=records.find(p=>p.endedAt===null)||null;storageError=false;completion=null;arrivalCandidate=null;controller?.abort();controller=null;route=null;lastRouteFrom=null;navigating=!!spot;follow=!!spot;render();drawRoute();drawTrack();syncMarkers();if(spot)updateRoute(true);}catch{storageError=true;feedback('Parking data changed but could not be read. Export a backup from History.');}});
follow=true;render();if(storageError)feedback('Parking storage could not be read. Export a backup from History before repairing browser storage.');if(token)initMap();startLocation();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});


$('google-maps').addEventListener('click',()=>{
 const url=new URL(spot?'https://www.google.com/maps/dir/':fresh()?'https://www.google.com/maps/search/':'https://www.google.com/maps');
 if(spot){url.searchParams.set('api','1');url.searchParams.set('destination',`${spot.coords[1]},${spot.coords[0]}`);url.searchParams.set('travelmode','walking');url.searchParams.set('dir_action','navigate');}
 else if(fresh()){url.searchParams.set('api','1');url.searchParams.set('query',`${current.coords[1]},${current.coords[0]}`);}
 $('google-maps').href=url.href;
});
