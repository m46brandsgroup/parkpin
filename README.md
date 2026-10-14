# Parkpin

Fullscreen Android-friendly parking PWA built with Vite, browser GPS, Mapbox GL JS Standard 3D buildings and Mapbox Walking Directions.

## Run

```
npm install
npm run dev
npm run build
npm run preview
```

Enter your own Mapbox public (`pk.`) token in Settings, or set `VITE_MAPBOX_TOKEN` in `.env.local` before building. The public token in `.env.example` is also used as a fallback; normal Vite environment files take priority. Public tokens are visible to browsers by design; restrict allowed URLs to your deployment and localhost in your Mapbox account. Never use secret tokens. Mapbox has usage-based pricing and free-tier allowances; review https://www.mapbox.com/pricing before deployment.

## Android

Serve `dist/` on HTTPS. Open the hosted URL in Android Chrome, allow precise location, and select **Add to Home screen / Install app**. A plain LAN HTTP URL cannot access GPS on Android. For USB local testing use `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` on the phone. The app shell and saved spot remain available offline after first load, but map resources and route updates require internet. Tracking runs while the web app is active; it is not a background GPS service.

Save parking stores GPS coordinates, accuracy and timestamp in localStorage on this device. Walking directions are recalculated after at least 8 metres of movement and 10 seconds between automatic requests. Immediately after saving, you are already at the car; a walking route appears once you move away. Ending parking archives the session in local history. Clearing browser storage removes history, so export a backup first. Current coordinates and the saved destination are sent to Mapbox for directions. No application backend stores location.

3D mode is a tilted street map with buildings where Mapbox has coverage, not photographic Street View. GPS accuracy and pedestrian routing vary; the app shows reported accuracy and rejects parking saves with accuracy worse than 100 metres.

## Checks

`npm test` checks geographic distance, formatting and persisted-location validation. Real Mapbox/GPS verification requires a valid token, HTTPS and location permission on a physical device.

Browser checks (with the dev server running and Google Chrome installed):

```
node scripts/check-browser.mjs
node scripts/check-routing.mjs
node scripts/check-history.mjs
node scripts/check-map-live.mjs
```

These use simulated GPS and mocked Mapbox routing responses. They verify save/reload/clear, location denial, responsive layout, token validation, route coordinate order, ETA/distance, steps, and API failure handling. They do not verify actual Mapbox data or a physical walking journey.

## History and backups

History lists every session newest first, grouped by local date. Each record includes coordinates, GPS accuracy, start time, end time, end reason, and duration. The active session shows a running parking timer. Old `parkpin-spot` data migrates into the versioned `parkpin-history` localStorage key without losing the saved position.

Automatic return detection requires an accurate GPS fix (35 m or better), departure beyond max(50 m, saved accuracy + current accuracy), then two fixes within 20 m of the parked position at least 8 seconds apart. Detection works while the app is open and receiving GPS; if the app was closed on return, its recorded end time is when it detects the return after reopening. Use **End parking** to end manually. Both completion methods retain the session and show its total duration.

**History → Export JSON** downloads a version 1 backup with all parking records (including an active session), without the Mapbox token. **Import JSON** validates the entire file before merging. Existing records win on matching IDs, so older exports do not reopen completed sessions. Imports with conflicting active sessions are rejected; end the current session first. Invalid files leave existing data intact. Limits: 5 MB per import and 10,000 total records, subject to browser localStorage capacity. Coordinates and timestamps in exported files are personal location history.

`check-history.mjs` tests migration-related behavior through the unit suite and the UI save/leave/return, duration, sorting, backup, deduplication and malformed-import flows with simulated GPS. `check-map-live.mjs` uses the configured public token against real Mapbox maps and Directions with simulated GPS; it is not a physical-device walking test.

## Live walking navigation

Save parking always requests a new high-accuracy GPS fix with `maximumAge: 0`. Once saved, it starts recording the walk and opens a pitched navigation map that follows the live location. Track my route requests another fresh fix and forces a route recalculation; dragging the map pauses camera-follow only, and tapping Track my route resumes it. Exiting navigation leaves location tracking active until parking ends.

The purple dashed line records the actual GPS track. The blue line is the fastest-duration walking route among the alternatives Mapbox returns, from the current position to the car. Requests update after 8 m of movement, with a 10-second minimum interval (a 5-second timer handles throttled updates). Low-accuracy fixes do not trigger routing. Right after saving you are already at the destination; a nonzero route appears after moving away.

Recorded GPS points persist with each parking session and are included in JSON backups. Old backups without a track remain valid. Points need accuracy of 35 m or better and at least 8 m of movement; tracks longer than 3,000 points are simplified by retaining every other older point plus the endpoints. Tracking runs only while the browser is active and receiving GPS, not as an Android background navigation service.

`node scripts/check-navigation.mjs` verifies fresh-position requests, automatic moving-origin rerouting, fastest-alternative selection and track persistence/export using simulated GPS and mocked routes. Browser fixtures simulate fresh sensor timestamps because Chromium's static GPS override otherwise retains the initial timestamp.

## Turn-by-turn view

Navigation uses Mapbox Standard night lighting, a blue maneuver panel, a direction marker and a compact arrival summary. Maneuver distance and remaining walking time update from GPS projected onto the route's step geometry between Directions API refreshes. Upcoming arrows represent walking maneuvers, not vehicle lanes. Walking away from the route by more than 35 m (or reported GPS accuracy) requests a reroute after a minimum 5-second request interval.

The bottom chevron expands parking controls/history; the top handle still collapses the card. Route overview fits the full path; the upper-left arrow resumes live following. Exact 3D building detail depends on Mapbox coverage for your actual location.

`node scripts/check-turn-guidance.mjs` checks movement through two turns, off-route recalculation and navigation controls with mocked routes/GPS. Physical-device GPS still needs a walking test.
