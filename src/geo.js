export function distance(a,b){const r=Math.PI/180;const dlat=(b[1]-a[1])*r,dlon=(b[0]-a[0])*r;const h=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function validSpot(p){return p&&Array.isArray(p.coords)&&p.coords.length===2&&p.coords.every(Number.isFinite)&&Math.abs(p.coords[0])<=180&&Math.abs(p.coords[1])<=90&&Number.isFinite(p.time);}
export function formatDistance(m){return m>=1000?`${(m/1000).toFixed(1)} km`:`${Math.round(m)} m`;}
