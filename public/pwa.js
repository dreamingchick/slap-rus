import {isMobileClient} from './device.js';

function cameFromArcade() {
  let entered = new URLSearchParams(location.search).get('from') === 'garu-arcade';
  try { entered = entered || (document.referrer && new URL(document.referrer).origin === 'https://garu-arcade-hub.snugbrink3.chatgpt.site'); } catch {}
  try {
    if (entered) sessionStorage.setItem('garu-arcade-entry', '1');
    return Boolean(entered || sessionStorage.getItem('garu-arcade-entry') === '1');
  } catch { return Boolean(entered); }
}

export function setupPwa({window,document,navigator}){
 const panel=document.getElementById('install-panel');
 const button=document.getElementById('install-button');
 const help=document.getElementById('install-help');
 if(!panel||!button||!help)return;
 const mobile=isMobileClient(navigator);
 const fromArcade=cameFromArcade();
 panel.classList.toggle('hidden',!mobile&&!fromArcade);
 if(fromArcade){
  panel.setAttribute('aria-label','가루 오락실로 돌아가기');
  const heading=panel.querySelector('strong');
  const explanation=panel.querySelector('p');
  if(heading)heading.textContent='가루 오락실로 돌아가기';
  if(explanation)explanation.textContent='다른 게임을 선택하려면 대문 홈으로 이동하세요.';
  button.textContent='← 대문 홈으로';
  button.onclick=()=>window.location.assign('https://garu-arcade-hub.snugbrink3.chatgpt.site/');
 }else{
  button.onclick=()=>{if(mobile)window.open('https://garu-arcade-hub.snugbrink3.chatgpt.site/#install-guide', '_blank', 'noopener,noreferrer')};
 }
 if(mobile&&'serviceWorker' in navigator){
  const register=()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>{console.warn('PWA setup failed',error?.name||'Error');});
  if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
 }
}
if(typeof window!=='undefined'&&typeof document!=='undefined')setupPwa({window,document,navigator});
