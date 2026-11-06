export function isMobileClient(device){
 const ua=device.userAgent||'';
 const ipadDesktop=/Macintosh/i.test(ua)&&device.maxTouchPoints>1;
 return device.maxTouchPoints>0&&(/Android|iPhone|iPad|iPod/i.test(ua)||device.userAgentData?.mobile===true||ipadDesktop);
}
export function isMobileRequest(headers){
 const ua=headers.get('user-agent')||'';
 return /Android|iPhone|iPad|iPod/i.test(ua)||headers.get('sec-ch-ua-mobile')==='?1'||(/Macintosh/i.test(ua)&&headers.get('x-game-device')==='ipad');
}
export function isGameTouch(event,mobile){return mobile&&event.isTrusted===true&&event.pointerType==='touch'&&event.isPrimary===true;}
export function deviceHint(device){return /Macintosh/i.test(device.userAgent||'')&&device.maxTouchPoints>1?'ipad':'mobile';}
