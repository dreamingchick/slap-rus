export function createResultGuard({now=()=>performance.now(),delay=800}={}){
 let openedAt=null,armed=null;
 return {
  delay,
  open(){openedAt=now();armed=null;return openedAt;},
  ready(){return openedAt!==null&&now()-openedAt>=delay;},
  isCurrent(opening){return openedAt===opening;},
  arm(event){armed=null;if(!this.ready()||!event.isTrusted||!event.isPrimary)return;if(event.pointerType!=='touch'&&!(event.pointerType==='mouse'&&event.button===0))return;armed={openedAt,at:now(),pointerId:event.pointerId};},
  cancel(){armed=null;},
  acceptClick(event){const press=armed;armed=null;if(!this.ready()||!event?.isTrusted)return false;if(event.detail===0)return true;return !!press&&press.openedAt===openedAt&&now()-press.at<=2000;},
  dismiss(){openedAt=null;armed=null;}
 };
}
