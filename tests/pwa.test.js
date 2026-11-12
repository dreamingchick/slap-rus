import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import vm from 'node:vm';import {setupPwa} from '../public/pwa.js';
const root=new URL('../public/',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8').replace(/^\uFEFF/,'');
test('manifest has stable identity, standalone launch and valid icon sizes',()=>{const m=JSON.parse(read('manifest.webmanifest'));assert.equal(m.id,'/');assert.equal(m.scope,'/');assert.equal(m.display,'standalone');assert.equal(new URL(m.start_url,'https://game.example').pathname,'/');assert(m.name.includes('등짝'));for(const size of [192,512])assert(m.icons.some(i=>i.sizes===size+'x'+size&&i.purpose==='any'));assert(m.icons.some(i=>i.purpose==='maskable'));for(const icon of m.icons){const bytes=readFileSync(new URL(icon.src.slice(1),root));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const [width,height]=icon.sizes.split('x').map(Number);assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);}const apple=readFileSync(new URL('icons/icon-180.png',root));assert.equal(apple.readUInt32BE(16),180);});
test('game retains the worker and hands installation to the arcade',()=>{
 const html=read('index.html');
 assert(!html.includes('rel="manifest"'));
 assert(html.includes('/pwa.js?v=arcade'));
 assert(html.includes('오락실 앱 설치'));
 for(const mobile of [true,false]){
  const opened=[],registered=[];
  const elements={'install-panel':{classList:{toggle(){}}},'install-button':{},'install-help':{}};
  setupPwa({
   window:{open:(...args)=>opened.push(args)},
   document:{getElementById:id=>elements[id],readyState:'complete'},
   navigator:{userAgent:mobile?'Android Mobile':'Windows NT',maxTouchPoints:mobile?5:0,
    serviceWorker:{register:async path=>registered.push(path)}},
  });
  elements['install-button'].onclick();
  assert.deepEqual(opened,mobile?[['https://garu-arcade-hub.snugbrink3.chatgpt.site/#install-guide','_blank','noopener,noreferrer']]:[]);
  assert.deepEqual(registered,mobile?['/sw.js']:[]);
 }
});
function serviceWorkerEnvironment(){const events={},stores=new Map(),deleted=[];let failNetwork=false,networkCalls=0,claimed=0;const key=request=>{const u=new URL(typeof request==='string'?request:request.url,'https://game.example');return u.pathname+u.search;};const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async addAll(paths){for(const path of paths){assert(existsSync(new URL(path.slice(1).split('?')[0],root)));store.set(key(path),new Response(path==='/offline.html'?read('offline.html'):'cached asset'));}},async match(request){return store.get(key(request))?.clone();},async put(request,response){store.set(key(request),response);}};},async keys(){return [...stores.keys()];},async delete(name){deleted.push(name);return stores.delete(name);}};const self={location:{origin:'https://game.example'},clients:{async claim(){claimed++;}},addEventListener:(name,fn)=>events[name]=fn};const context={self,caches,URL,Response,fetch:async()=>{networkCalls++;if(failNetwork)throw Error('offline');return new Response('online navigation');}};vm.runInNewContext(read('sw.js'),context);return {events,stores,deleted,offline:()=>failNetwork=true,networkCalls:()=>networkCalls,claimed:()=>claimed};}
async function install(s){let job;s.events.install({waitUntil:p=>job=p});await job;}
async function request(s,path,options={}){let response;const req={url:new URL(path,'https://game.example').href,method:'GET',mode:'cors',...options};s.events.fetch({request:req,respondWith:p=>response=p});return response===undefined?undefined:await response;}
test('worker caches only static resources and all precache assets exist',async()=>{const s=serviceWorkerEnvironment();await install(s);const cache=[...s.stores.values()][0];assert(cache.has('/offline.html'));assert(cache.has('/manifest.webmanifest'));assert([...cache.keys()].every(k=>!k.startsWith('/api/')));});
test('ranking APIs, POST requests and cross-origin traffic bypass the cache',async()=>{const s=serviceWorkerEnvironment();await install(s);assert.equal(await request(s,'/api/rankings'),undefined);assert.equal(await request(s,'/api/scores',{method:'POST'}),undefined);assert.equal(await request(s,'/api/rounds',{method:'POST'}),undefined);assert.equal(await request(s,'https://other.example/style.css?v=0.6.0'),undefined);});
test('online navigation uses network and offline navigation shows connection notice',async()=>{const s=serviceWorkerEnvironment();await install(s);assert.equal(await (await request(s,'/',{mode:'navigate'})).text(),'online navigation');s.offline();const response=await request(s,'/',{mode:'navigate'});assert((await response.text()).includes('인터넷 연결이 필요해요'));});
test('cached static assets remain available offline',async()=>{const s=serviceWorkerEnvironment();await install(s);s.offline();const response=await request(s,'/app.js?v=0.5.0');assert.equal(await response.text(),'cached asset');assert.equal(s.networkCalls(),0);});
test('activation removes only this apps old cache and never forces a running game update',async()=>{const s=serviceWorkerEnvironment();await install(s);s.stores.set('garu-slap-rus-static-v0.5.0',new Map());s.stores.set('another-app',new Map());let job;s.events.activate({waitUntil:p=>job=p});await job;assert.deepEqual(s.deleted,['garu-slap-rus-static-v0.5.0']);assert(s.stores.has('another-app'));assert.equal(s.claimed(),1);assert(!read('sw.js').includes('skipWaiting'));});
