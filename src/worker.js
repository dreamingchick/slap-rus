import {RULES,tally,validateHits,normalizeNickname} from '../public/game.js';
const TTL=10*60*1000,MAX_BODY=16000;
function json(data,status=200,extra={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
function fail(message,status=400,code='invalid_request'){return json({error:message,code},status);}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readBody(request){if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('type');if(!request.body)throw new Error('json');const reader=request.body.getReader(),parts=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY)throw new Error('size');parts.push(value);}}catch(error){await reader.cancel();throw error;}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('json');return data;}
export function createWorker({now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}){return {
 async fetch(request,env){const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(path==='/api/health'&&request.method==='GET'){
    if(!env.DB||!env.RATE_LIMITER)return fail('랭킹 서버 설정을 확인하고 있습니다.',503,'not_ready');
    const allowed=await env.RATE_LIMITER.limit({key:`slap-rus:read:${request.headers.get('CF-Connecting-IP')||'local'}`});if(!allowed.success)return json({error:'요청이 많습니다. 1분 후 다시 시도해 주세요.',code:'rate_limit'},429,{'Retry-After':'60'});await env.DB.prepare('SELECT id FROM rounds LIMIT 1').first();return json({ok:true,ranking:'global',rulesVersion:RULES.version});
   }
   const route=(path==='/api/rankings'&&request.method==='GET')?'read':((path==='/api/rounds'||path==='/api/scores')&&request.method==='POST')?'write':null;
   if(!route)return fail('지원하지 않는 요청입니다.',404,'not_found');
   if(!env.DB||!env.RATE_LIMITER)return fail('랭킹 서버가 아직 준비되지 않았습니다.',503,'not_ready');
   if(route==='write'&&request.headers.get('origin')!==url.origin)return fail('게임 화면에서 다시 시도해 주세요.',403,'origin');
   const ip=request.headers.get('CF-Connecting-IP')||'local';
   const allowed=await env.RATE_LIMITER.limit({key:`slap-rus:${route}:${ip}`});
   if(!allowed.success)return json({error:'요청이 많습니다. 1분 후 다시 시도해 주세요.',code:'rate_limit'},429,{'Retry-After':'60'});
   if(route==='read'){
    const data=await env.DB.prepare('SELECT nickname,score,max_combo AS combo,submitted_at AS created FROM rounds WHERE score IS NOT NULL ORDER BY score DESC,submitted_at ASC,id ASC LIMIT 50').all();
    return json({entries:data.results,scope:'global'});
   }
   let body;try{body=await readBody(request);}catch(e){return fail(e.message==='size'?'요청 크기가 너무 큽니다.':'올바른 JSON 요청이 필요합니다.',e.message==='size'?413:400);}
   const current=now();
   if(path==='/api/rounds'){
    const id=uuid(),token=uuid()+uuid();
    await env.DB.prepare('INSERT INTO rounds (id,token_hash,issued_at,rules_version) VALUES (?,?,?,?)').bind(id,await digest(token),current,RULES.version).run();
    return json({roundId:id,token,rules:RULES,expiresIn:TTL},201);
   }
   const nickname=normalizeNickname(body.nickname);
   if(!nickname)return fail('닉네임은 한글·영문·숫자 2~12자로 입력해 주세요.');
   if(!validateHits(body.hits))return fail('올바르지 않은 플레이 기록입니다.');
   if(typeof body.roundId!=='string'||body.roundId.length>64||typeof body.token!=='string'||body.token.length>128)return fail('플레이 인증 정보가 없습니다.',401,'token');
   const round=await env.DB.prepare('SELECT * FROM rounds WHERE id=?').bind(body.roundId).first();
   if(!round||round.token_hash!==await digest(body.token))return fail('플레이 인증 정보가 일치하지 않습니다.',401,'token');
   const payloadHash=await digest(JSON.stringify({nickname,hits:body.hits}));
   if(round.score!==null){if(round.payload_hash===payloadHash)return json({score:round.score,maxCombo:round.max_combo,alreadySaved:true});return fail('이미 등록한 판입니다.',409,'already_submitted');}
   if(round.rules_version!==RULES.version)return fail('게임이 업데이트되었습니다. 새로 시작해 주세요.',409,'rules_changed');
   if(current-round.issued_at<RULES.duration+RULES.countdown)return fail('플레이가 끝난 뒤 등록해 주세요.',400,'too_early');
   if(current-round.issued_at>TTL)return fail('등록 가능 시간이 지났습니다. 다시 도전해 주세요.',410,'expired');
   const result=tally(body.hits);
   const update=await env.DB.prepare('UPDATE rounds SET nickname=?,score=?,max_combo=?,submitted_at=?,payload_hash=? WHERE id=? AND score IS NULL').bind(nickname,result.score,result.maxCombo,current,payloadHash,body.roundId).run();
   if(!update.meta.changes){const saved=await env.DB.prepare('SELECT score,max_combo,payload_hash FROM rounds WHERE id=?').bind(body.roundId).first();if(saved?.payload_hash===payloadHash)return json({score:saved.score,maxCombo:saved.max_combo,alreadySaved:true});return fail('이미 등록한 판입니다.',409,'already_submitted');}
   return json({score:result.score,maxCombo:result.maxCombo},201);
  }catch(error){console.error('ranking_request_failed',error?.name||'Error');return fail('랭킹 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',503,'server_error');}
 },
 async scheduled(_event,env){await env.DB.prepare('DELETE FROM rounds WHERE score IS NULL AND issued_at < ?').bind(now()-TTL).run();}
};}
export default createWorker();
