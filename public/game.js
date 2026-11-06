export const RULES = Object.freeze({version:4,duration:30000,interval:850,intervalEnd:600,perfectStart:65,perfectEnd:30,firstTarget:1500,countdown:3000,minInputGap:100});
const DELTA=RULES.interval-RULES.intervalEnd;
export function difficultyAt(time){const progress=Math.max(0,Math.min(1,time/RULES.duration));const interval=RULES.interval-DELTA*progress;return {progress,interval,speed:RULES.interval/interval,perfect:RULES.perfectStart+(RULES.perfectEnd-RULES.perfectStart)*progress};}
// Integrating cycles per millisecond gives continuous acceleration without per-frame drift.
function cyclesAt(time){if(time<0)return time/RULES.interval;const bounded=Math.min(time,RULES.duration);const cycles=RULES.duration/DELTA*Math.log(RULES.interval/(RULES.interval-DELTA*bounded/RULES.duration));return cycles+Math.max(0,time-RULES.duration)/RULES.intervalEnd;}
const FIRST_PHASE=cyclesAt(RULES.firstTarget),END_PHASE=cyclesAt(RULES.duration);
function timeAtCycles(cycles){if(cycles<0)return cycles*RULES.interval;if(cycles>END_PHASE)return RULES.duration+(cycles-END_PHASE)*RULES.intervalEnd;return RULES.duration*RULES.interval/DELTA*(-Math.expm1(-cycles*DELTA/RULES.duration));}
export function phaseAt(time){return cyclesAt(time)-FIRST_PHASE;}
export function beatAt(time){const beat=Math.round(phaseAt(time));return beat===0?0:beat;}
export function targetAt(beat){return timeAtCycles(beat+FIRST_PHASE);}
// One stable pseudo-random position per beat; the same seed reproduces all judgements.
export function perfectOffsetAt(beat,seed=0){
 if(!seed)return 0;
 let x=(Math.trunc(seed)>>>0)^Math.imul((beat+1)|0,0x9e3779b9);
 x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);x=(x^(x>>>16))>>>0;
 const span=140-difficultyAt(targetAt(Math.max(0,beat))).perfect-8;
 return (x/4294967296*2-1)*span;
}
export function perfectTargetAt(beat,seed=0){return targetAt(beat)+perfectOffsetAt(beat,seed);}
export function judge(offset,targetTime=0,seed=0){const d=Math.abs(offset),perfect=difficultyAt(targetTime).perfect;const center=perfectOffsetAt(beatAt(targetTime),seed);return Math.abs(offset-center)<=perfect+1e-7?{label:'PERFECT',base:100}:d<=140+1e-7?{label:'GREAT',base:60}:d<=230+1e-7?{label:'GOOD',base:30}:{label:'MISS',base:0};}
export function gaugeAt(time,seed=0){
 const beat=beatAt(time),validBeat=Math.max(0,beat),target=targetAt(validBeat);
 const zone=(window,center=target)=>{const left=50+90*(phaseAt(center-window)-validBeat);const right=50+90*(phaseAt(center+window)-validBeat);return {left,width:right-left};};
 return {beat,target,perfectTarget:perfectTargetAt(validBeat,seed),needle:beat<0?5:Math.max(2,Math.min(98,50+90*(phaseAt(time)-beat))),zones:{perfect:zone(difficultyAt(target).perfect,perfectTargetAt(validBeat,seed)),great:zone(140),good:zone(230)},...difficultyAt(time)};
}
export function tally(hits,seed=0){let score=0,combo=0,maxCombo=0,previous=-1;const seen=new Set();const counts={PERFECT:0,GREAT:0,GOOD:0,MISS:0};for(const t of hits){const beat=beatAt(t),target=targetAt(beat);if(beat<0||target>=RULES.duration||seen.has(beat)){combo=0;counts.MISS++;continue;}if(beat>previous+1)combo=0;previous=beat;seen.add(beat);const j=judge(t-target,target,seed);counts[j.label]++;if(j.base){combo++;maxCombo=Math.max(combo,maxCombo);score+=Math.round(j.base*(1+Math.min(Math.floor((combo-1)/5),4)*.25));}else combo=0;}return {score,maxCombo,combo,counts};}
export function validateHits(hits){return Array.isArray(hits)&&hits.length<=300&&hits.every((t,i)=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<RULES.duration&&(i===0||t-hits[i-1]>=RULES.minInputGap));}
export function normalizeNickname(value){if(typeof value!=='string')return null;const name=value.normalize('NFKC').trim();return /^[\p{L}\p{N}_ -]{2,12}$/u.test(name)?name:null;}
