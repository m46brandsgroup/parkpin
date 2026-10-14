import {defineConfig,loadEnv} from 'vite';
// Also accept the public token supplied in .env.example; normal Vite env files win.
export default defineConfig(({mode})=>{
 const configured=loadEnv(mode,process.cwd(),'VITE_').VITE_MAPBOX_TOKEN;
 const example=loadEnv('example',process.cwd(),'VITE_').VITE_MAPBOX_TOKEN;
 const token=configured||example||'';
 return {define:{'import.meta.env.VITE_MAPBOX_TOKEN':JSON.stringify(token.startsWith('pk.')&&!token.includes('your_public_token')?token:'')}};
});
