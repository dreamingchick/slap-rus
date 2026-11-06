import {isMobileClient} from './device.js';
export function installHelp(device){const ios=/iPhone|iPad|iPod/i.test(device.userAgent||'')||(/Macintosh/i.test(device.userAgent||'')&&device.maxTouchPoints>1);return ios?'Safari에서 이 주소를 열고 공유 버튼 → 홈 화면에 추가를 선택해 주세요.':'Chrome에서 이 주소를 열고 우측 상단 ⋮ 메뉴 → 앱 설치 또는 홈 화면에 추가를 선택해 주세요. 앱 안의 브라우저라면 먼저 Chrome에서 열어 주세요.';}
export function setupPwa({window,document,navigator}){
 const panel=document.getElementById('install-panel'),button=document.getElementById('install-button'),help=document.getElementById('install-help');
 if(!panel||!button||!help)return;
 const mobile=isMobileClient(navigator),mode=window.matchMedia('(display-mode: standalone)');let pending=null;
 const standalone=()=>mode.matches||navigator.standalone===true;
 const refresh=()=>{panel.classList.toggle('hidden',!mobile||standalone());};
 const showHelp=text=>{help.textContent=text;help.classList.remove('hidden');};
 refresh();mode.addEventListener?.('change',refresh);
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();if(!mobile||standalone())return;pending=event;button.disabled=false;button.textContent='앱 설치';refresh();});
 window.addEventListener('appinstalled',()=>{pending=null;panel.classList.add('hidden');});
 button.onclick=async()=>{
  if(!mobile||standalone())return;
  if(!pending){showHelp(installHelp(navigator));return;}
  const prompt=pending;pending=null;button.disabled=true;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted'){button.textContent='설치 요청 완료';showHelp('설치가 진행됩니다. 홈 화면에서 개미 아이콘을 확인해 주세요.');}else{button.textContent='설치 방법';button.disabled=false;}}
  catch{button.textContent='설치 방법';button.disabled=false;showHelp(installHelp(navigator));}
 };
 if(mobile&&'serviceWorker' in navigator){
  const register=()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>{console.warn('PWA setup failed',error?.name||'Error');showHelp('설치 준비를 완료하지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');});
  if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
 }
}
if(typeof window!=='undefined'&&typeof document!=='undefined')setupPwa({window,document,navigator});
