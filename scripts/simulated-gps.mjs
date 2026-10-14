// Chromium's fixed GPS fixture retains its original timestamp. Simulate a new
// sensor fix for getCurrentPosition while keeping the app's maximumAge: 0 call.
export async function freshSimulatedGPS(page){
 await page.addInitScript(()=>{
  const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition=(success,error,options)=>original(p=>success({coords:p.coords,timestamp:Date.now()}),error,{...options,maximumAge:60000});
 });
}
export async function openParkingDetails(page){
 if(await page.locator('#nav-details-toggle').isVisible()&&await page.locator('#nav-details-toggle').getAttribute('aria-expanded')==='false')await page.locator('#nav-details-toggle').click();
}
export async function openParkingHistory(page){
 if(await page.locator('#history').isVisible())await page.locator('#history').click();
 else{await openParkingDetails(page);await page.locator('#nav-history').click();}
}
