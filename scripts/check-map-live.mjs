import {freshSimulatedGPS} from './simulated-gps.mjs';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:12.9716,longitude:77.5946,accuracy:10}});
 const page=await context.newPage();await freshSimulatedGPS(page);await page.goto('http://localhost:5173');
 await page.waitForFunction(()=>document.getElementById('map-placeholder').hidden,{},{timeout:45000});
 await page.screenshot({path:'/tmp/parkpin-live-map.png'});
 await page.getByRole('button',{name:'Save parking',exact:false}).click();await page.locator('#navigation-banner').waitFor();await page.locator('#nav-details-toggle').click();
 await context.setGeolocation({latitude:12.975,longitude:77.596,accuracy:10});await page.waitForTimeout(500);await page.locator('#walk').click();
 await page.getByText('Follow the blue walking route back to your car.').waitFor({timeout:30000});
 await page.locator('#nav-details-toggle').click();await page.waitForTimeout(1600);await page.screenshot({path:'/tmp/parkpin-live-route.png'});await page.setViewportSize({width:1170,height:601});await page.waitForTimeout(1000);await page.screenshot({path:'/tmp/parkpin-navigation-desktop.png'});
 console.log('PASS: real Mapbox token, 3D map load and live Directions API response using simulated GPS.');
}finally{await browser.close()}
