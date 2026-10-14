export function initParkingSheet(){
 const card=document.querySelector('.parking-card');
 const handle=document.getElementById('card-handle');
 const content=document.getElementById('parking-card-content');
 let collapsed=false,drag=null,closedOffset=0;
 function measure(){
  const bottom=parseFloat(getComputedStyle(card).bottom)||0;
  // Leave the full touch target just above the device's bottom safe area.
  const safe=parseFloat(getComputedStyle(card).getPropertyValue('--sheet-safe-bottom'))||0;
  closedOffset=Math.max(0,card.getBoundingClientRect().height+bottom-44-safe-(parseFloat(getComputedStyle(card).borderTopWidth)||0));
  card.style.setProperty('--sheet-closed-offset',`${closedOffset}px`);
 }
 function settle(next){
  collapsed=next;card.classList.remove('is-dragging');card.style.removeProperty('transform');
  card.classList.toggle('is-collapsed',collapsed);content.inert=collapsed;
  handle.setAttribute('aria-expanded',String(!collapsed));
  handle.setAttribute('aria-label',collapsed?'Show parking card':'Hide parking card');
  if(collapsed){card.scrollTop=0;handle.focus({preventScroll:true});}
 }
 handle.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0)return;
  measure();drag={id:e.pointerId,y:e.clientY,start:collapsed?closedOffset:0,collapsed};
  handle.setPointerCapture(e.pointerId);card.classList.add('is-dragging');
 });
 handle.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const offset=Math.min(closedOffset,Math.max(0,drag.start+e.clientY-drag.y));
  card.style.transform=`translateY(${offset}px)`;
 });
 function finish(e,canceled=false){
  if(!drag||e.pointerId!==drag.id)return;
  const previous=drag,dy=e.clientY-previous.y;drag=null;
  if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
  settle(canceled?previous.collapsed:Math.abs(dy)<6?!previous.collapsed:dy>40?true:dy<-40?false:previous.collapsed);
 }
 handle.addEventListener('pointerup',e=>finish(e));
 handle.addEventListener('pointercancel',e=>finish(e,true));
 handle.addEventListener('lostpointercapture',e=>{if(drag)finish(e,true);});
 // Keyboard and assistive-technology clicks have no pointer sequence.
 handle.addEventListener('click',e=>{if(e.detail===0)settle(!collapsed);});
 handle.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();settle(e.key==='ArrowDown');}});
 new ResizeObserver(measure).observe(card);
 window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
 measure();
}
