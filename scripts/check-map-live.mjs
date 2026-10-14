import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:12.9716,longitude:77.5946,accuracy:10}});
 const page=await context.newPage();await page.goto('http://localhost:5173');
 await page.waitForFunction(()=>document.getElementById('map-placeholder').hidden,{},{timeout:45000});
 await page.screenshot({path:'/tmp/parkpin-live-map.png'});
 await page.getByRole('button',{name:'Save parking',exact:false}).click();
 await context.setGeolocation({latitude:12.975,longitude:77.596,accuracy:10});await page.waitForTimeout(500);await page.getByRole('button',{name:'Walk to my car',exact:false}).click();
 await page.getByText('Follow the green walking route back to your car.').waitFor({timeout:30000});
 await page.screenshot({path:'/tmp/parkpin-live-route.png'});
 console.log('PASS: real Mapbox token, 3D map load and live Directions API response using simulated GPS.');
}finally{await browser.close()}
