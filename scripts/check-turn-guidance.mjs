import {freshSimulatedGPS} from './simulated-gps.mjs';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:12.971,longitude:77.592,accuracy:10}});
const page=await context.newPage();await freshSimulatedGPS(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://api.mapbox.com/mapbox-gl-js/**/mapbox-gl.js',r=>r.fulfill({contentType:'application/javascript',body:`window.mapboxgl={Map:class{constructor(){this.sources={}}on(e,f){if(e==='load')setTimeout(f,10)}addSource(k,v){this.sources[k]={setData(){}}}getSource(k){return this.sources[k]}addLayer(){}easeTo(){}flyTo(){}fitBounds(){}remove(){}zoomIn(){}zoomOut(){}},Marker:class{setLngLat(){return this}addTo(){return this}remove(){}},LngLatBounds:class{extend(){return this}}};`}));

let count=0;
const route={duration:240,distance:330,geometry:{type:'LineString',coordinates:[[77.59,12.97],[77.591,12.97],[77.591,12.971],[77.592,12.971]]},legs:[{steps:[
{distance:110,geometry:{coordinates:[[77.59,12.97],[77.591,12.97]]},maneuver:{instruction:'Head east',location:[77.59,12.97]}},
{distance:110,geometry:{coordinates:[[77.591,12.97],[77.591,12.971]]},maneuver:{modifier:'left',instruction:'Turn left onto North Path',location:[77.591,12.97]}},
{distance:110,geometry:{coordinates:[[77.591,12.971],[77.592,12.971]]},maneuver:{modifier:'right',instruction:'Turn right onto East Path',location:[77.591,12.971]}},
{distance:0,geometry:{coordinates:[[77.592,12.971],[77.592,12.971]]},maneuver:{type:'arrive',instruction:'Arrive at your car',location:[77.592,12.971]}}
]}]};
await page.route('https://api.mapbox.com/directions/**',r=>{count++;return r.fulfill({contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[route]})})});
await page.goto('http://localhost:5173');await page.getByText('Live location · ±10 m').waitFor();await page.locator('#save').click();await page.locator('#navigation-banner').waitFor();
await context.setGeolocation({latitude:12.97,longitude:77.5905,accuracy:10});await page.locator('#nav-recenter').click();await page.locator('#navigation-instruction').filter({hasText:'Turn left onto North Path'}).waitFor();assert.equal(await page.locator('#maneuver-icon').textContent(),'↰');
await context.setGeolocation({latitude:12.9704,longitude:77.591,accuracy:10});await page.locator('#navigation-instruction').filter({hasText:'Turn right onto East Path'}).waitFor();assert.equal(await page.locator('#maneuver-icon').textContent(),'↱');
await page.locator('#nav-details-toggle').click();assert.equal(await page.locator('#walk').isVisible(),true);await page.locator('#nav-history').click();await page.locator('#history-dialog').waitFor();await page.locator('#close-history').click();await page.locator('#nav-details-toggle').click();assert.equal(await page.locator('#walk').isVisible(),false);
await page.waitForTimeout(5500);const before=count;await context.setGeolocation({latitude:12.973,longitude:77.594,accuracy:10});await page.waitForTimeout(1200);assert.ok(count>before,'Off-route fix triggers a new route request');
await page.locator('#exit-navigation').click();assert.equal(await page.locator('#navigation-banner').isVisible(),false);assert.equal(await page.locator('#history').isVisible(),true);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: live maneuver advancement, remaining turn distance, off-route rerouting, details/history controls, exit navigation.');
