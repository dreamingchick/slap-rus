import {RULES,tally,validateHits,normalizeNickname} from '../public/game.js';
import {isMobileRequest} from '../public/device.js';
export const SEASON='ant-random-v1';
const VERSION='0.5.0',TTL=600000,MAX_BODY=16000,MAX_INPUT_AGE=6000;
function json(data,status=200,extra={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
function fail(error,status=400,code='invalid_request'){return json({error,code,serviceVersion:VERSION},status);}
function bindingFailure(env){
 if(!env.DB||typeof env.DB.prepare!=='function')return fail('랭킹 서버 연결 설정을 확인 중입니다.',503,'db_binding_missing');
 for(const name of ['RATE_LIMITER','START_LIMITER'])if(typeof env[name]?.limit!=='function')return fail('랭킹 서버 연결 설정을 확인 중입니다.',503,'rate_binding_missing');
 return null;
}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readBody(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!request.body)throw Error('json');
 const reader=request.body.getReader(),parts=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY)throw Error('size');parts.push(value);}}catch(error){await reader.cancel();throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('json');return data;
}
function limited(){return json({error:'요청이 많습니다. 1분 후 다시 시도해 주세요.',code:'rate_limit'},429,{'Retry-After':'60'});}
const prefixMatches=(short,long)=>short.every((t,i)=>t===long[i]);
export function createWorker({now=()=>Date.now(),uuid=()=>crypto.randomUUID(),randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0]||1}={}){return {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  let stage='configuration';
  try{
   const health=path==='/api/health'&&request.method==='GET';
   const read=path==='/api/rankings'&&request.method==='GET';
   const write=['/api/rounds','/api/inputs','/api/scores'].includes(path)&&request.method==='POST';
   if(!health&&!read&&!write)return fail('지원하지 않는 요청입니다.',404,'not_found');
   if(write){
    if(request.headers.get('origin')!==url.origin)return fail('게임 화면에서 다시 시도해 주세요.',403,'origin');
    if(!isMobileRequest(request.headers))return fail('모바일 기기의 터치로 플레이해 주세요.',403,'mobile_only');
   }
   const configurationError=bindingFailure(env);if(configurationError)return configurationError;
   const ip=request.headers.get('CF-Connecting-IP')||'local';stage='rate_limit';
   // Start requests have a stricter budget; input uploads use a separate bucket from results.
   const kind=health||read?'read':path==='/api/rounds'?'start':path==='/api/inputs'?'input':'score';
   const limiter=kind==='start'?env.START_LIMITER:env.RATE_LIMITER;
   if(!(await limiter.limit({key:`slap-rus:${kind}:${ip}`})).success)return limited();
   stage='database';
   if(health){
    const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rounds'").first();
    if(!table)return fail('랭킹 데이터를 준비 중입니다.',503,'db_schema_missing');
    await env.DB.prepare('SELECT id,season,seed,input_hits,score,max_combo,submitted_at,payload_hash,token_hash,issued_at,rules_version,nickname FROM rounds LIMIT 1').first();
    return json({ok:true,ranking:'global',rulesVersion:RULES.version,serviceVersion:VERSION,season:SEASON,mobileOnly:true});
   }
   if(read){
    const data=await env.DB.prepare('SELECT nickname,score,max_combo AS combo,submitted_at AS created FROM rounds WHERE score IS NOT NULL AND season=? ORDER BY score DESC,submitted_at ASC,id ASC LIMIT 50').bind(SEASON).all();
    return json({entries:data.results,scope:'global',season:SEASON});
   }
   let body;try{body=await readBody(request);}catch(e){return fail(e.message==='size'?'요청 크기가 너무 큽니다.':'올바른 JSON 요청이 필요합니다.',e.message==='size'?413:400);}
   const current=now();
   if(path==='/api/rounds'){
    const id=uuid(),token=uuid()+uuid(),seed=randomSeed();
    await env.DB.prepare('INSERT INTO rounds (id,token_hash,issued_at,rules_version,season,seed) VALUES (?,?,?,?,?,?)').bind(id,await digest(token),current,RULES.version,SEASON,seed).run();
    return json({roundId:id,token,seed,rules:RULES,season:SEASON,expiresIn:TTL},201);
   }
   if(typeof body.roundId!=='string'||body.roundId.length>64||typeof body.token!=='string'||body.token.length>128)return fail('플레이 인증 정보가 없습니다.',401,'token');
   const round=await env.DB.prepare('SELECT * FROM rounds WHERE id=?').bind(body.roundId).first();
   if(!round||round.token_hash!==await digest(body.token))return fail('플레이 인증 정보가 일치하지 않습니다.',401,'token');
   if(round.season!==SEASON||round.rules_version!==RULES.version)return fail('게임이 업데이트되었습니다. 새로 시작해 주세요.',409,'rules_changed');
   const stored=JSON.parse(round.input_hits);
   if(path==='/api/inputs'){
    if(round.score!==null)return fail('이미 등록한 판입니다.',409,'already_submitted');
    if(current-round.issued_at>TTL)return fail('경기가 만료되었습니다. 다시 도전해 주세요.',410,'expired');
    if(!validateHits(body.hits))return fail('올바르지 않은 입력 기록입니다.');
    // Identical or older retries are safe, but previously recorded inputs are immutable.
    if(body.hits.length<=stored.length){if(prefixMatches(body.hits,stored))return json({accepted:stored.length});return fail('이미 전송한 기록은 바꿀 수 없습니다.',409,'input_conflict');}
    if(!prefixMatches(stored,body.hits))return fail('이미 전송한 기록은 바꿀 수 없습니다.',409,'input_conflict');
    const elapsed=current-round.issued_at-RULES.countdown;
    if(body.hits.slice(stored.length).some(t=>t>elapsed+1000||t<elapsed-MAX_INPUT_AGE))return fail('입력 기록이 제때 전달되지 않았습니다. 연결을 확인하고 다시 도전해 주세요.',400,'input_timing');
    const updated=await env.DB.prepare('UPDATE rounds SET input_hits=? WHERE id=? AND input_hits=? AND score IS NULL').bind(JSON.stringify(body.hits),round.id,round.input_hits).run();
    if(!updated.meta.changes)return fail('입력 전송이 겹쳤습니다. 다시 시도해 주세요.',409,'input_conflict');
    return json({accepted:body.hits.length});
   }
   const nickname=normalizeNickname(body.nickname);
   if(!nickname)return fail('닉네임은 한글·영문·숫자 2~12자로 입력해 주세요.');
   if(!validateHits(body.hits)||JSON.stringify(body.hits)!==round.input_hits)return fail('서버에 전달된 입력과 일치하지 않습니다. 기록 전송을 다시 시도해 주세요.',400,'inputs_unverified');
   const payloadHash=await digest(JSON.stringify({nickname,hits:stored,seed:round.seed}));
   if(round.score!==null){if(round.payload_hash===payloadHash)return json({score:round.score,maxCombo:round.max_combo,alreadySaved:true});return fail('이미 등록한 판입니다.',409,'already_submitted');}
   if(current-round.issued_at<RULES.duration+RULES.countdown)return fail('플레이가 끝난 뒤 등록해 주세요.',400,'too_early');
   if(current-round.issued_at>TTL)return fail('등록 가능 시간이 지났습니다. 다시 도전해 주세요.',410,'expired');
   const result=tally(stored,round.seed);
   // Comparing the immutable stream in the same statement prevents a late upload/result race.
   const update=await env.DB.prepare('UPDATE rounds SET nickname=?,score=?,max_combo=?,submitted_at=?,payload_hash=? WHERE id=? AND score IS NULL AND input_hits=?').bind(nickname,result.score,result.maxCombo,current,payloadHash,body.roundId,round.input_hits).run();
   if(!update.meta.changes){const saved=await env.DB.prepare('SELECT score,max_combo,payload_hash FROM rounds WHERE id=?').bind(body.roundId).first();if(saved?.payload_hash===payloadHash)return json({score:saved.score,maxCombo:saved.max_combo,alreadySaved:true});return fail('기록이 변경되었거나 이미 등록한 판입니다.',409,'already_submitted');}
   return json({score:result.score,maxCombo:result.maxCombo},201);
  }catch(error){const code=stage==='database'?'db_error':stage==='rate_limit'?'rate_limiter_error':'server_error';console.error(JSON.stringify({event:'ranking_request_failed',stage,code,name:error?.name||'Error',message:String(error?.message||'Unknown error').slice(0,500)}));return fail('랭킹 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',503,code);}
 },
 async scheduled(_event,env){await env.DB.prepare('DELETE FROM rounds WHERE score IS NULL AND issued_at < ?').bind(now()-TTL).run();}
};}
export default createWorker();
