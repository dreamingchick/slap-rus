import {isMobileClient} from './device.js';

export function setupPwa({window,document,navigator}){
 const panel=document.getElementById('install-panel');
 const button=document.getElementById('install-button');
 const help=document.getElementById('install-help');
 if(!panel||!button||!help)return;
 const mobile=isMobileClient(navigator);
 panel.classList.toggle('hidden',!mobile);
 button.onclick=()=>{if(mobile)window.open('https://garu-arcade-hub.snugbrink3.chatgpt.site/#install-guide', '_blank', 'noopener,noreferrer')};
 if(mobile&&'serviceWorker' in navigator){
  const register=()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>{console.warn('PWA setup failed',error?.name||'Error');});
  if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
 }
}
if(typeof window!=='undefined'&&typeof document!=='undefined')setupPwa({window,document,navigator});
