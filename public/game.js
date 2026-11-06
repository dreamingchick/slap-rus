export const RULES = Object.freeze({version:3,duration:30000,interval:850,intervalEnd:600,perfectStart:65,perfectEnd:30,firstTarget:1500,countdown:3000,minInputGap:100});
const DELTA=RULES.interval-RULES.intervalEnd;
export function difficultyAt(time){const progress=Math.max(0,Math.min(1,time/RULES.duration));const interval=RULES.interval-DELTA*progress;return {progress,interval,speed:RULES.interval/interval,perfect:RULES.perfectStart+(RULES.perfectEnd-RULES.perfectStart)*progress};}
// Integrating cycles per millisecond gives continuous acceleration without per-frame drift.
function cyclesAt(time){if(time<0)return time/RULES.interval;const bounded=Math.min(time,RULES.duration);const cycles=RULES.duration/DELTA*Math.log(RULES.interval/(RULES.interval-DELTA*bounded/RULES.duration));return cycles+Math.max(0,time-RULES.duration)/RULES.intervalEnd;}
const FIRST_PHASE=cyclesAt(RULES.firstTarget),END_PHASE=cyclesAt(RULES.duration);
function timeAtCycles(cycles){if(cycles<0)return cycles*RULES.interval;if(cycles>END_PHASE)return RULES.duration+(cycles-END_PHASE)*RULES.intervalEnd;return RULES.duration*RULES.interval/DELTA*(-Math.expm1(-cycles*DELTA/RULES.duration));}
export function phaseAt(time){return cyclesAt(time)-FIRST_PHASE;}
export function beatAt(time){return Math.round(phaseAt(time));}
export function targetAt(beat){return timeAtCycles(beat+FIRST_PHASE);}
export function judge(offset,targetTime=0){const d=Math.abs(offset),perfect=difficultyAt(targetTime).perfect;return d<=perfect+1e-7?{label:'PERFECT',base:100}:d<=140+1e-7?{label:'GREAT',base:60}:d<=230+1e-7?{label:'GOOD',base:30}:{label:'MISS',base:0};}
export function gaugeAt(time){
 const beat=beatAt(time),target=targetAt(Math.max(0,beat));
 const zone=window=>{const left=50+90*(phaseAt(target-window)-Math.max(0,beat));const right=50+90*(phaseAt(target+window)-Math.max(0,beat));return {left,width:right-left};};
 return {beat,target,needle:beat<0?5:Math.max(2,Math.min(98,50+90*(phaseAt(time)-beat))),zones:{perfect:zone(difficultyAt(target).perfect),great:zone(140),good:zone(230)},...difficultyAt(time)};
}
export function tally(hits){let score=0,combo=0,maxCombo=0,previous=-1;const seen=new Set();const counts={PERFECT:0,GREAT:0,GOOD:0,MISS:0};for(const t of hits){const beat=beatAt(t),target=targetAt(beat);if(beat<0||target>=RULES.duration||seen.has(beat)){combo=0;counts.MISS++;continue;}if(beat>previous+1)combo=0;previous=beat;seen.add(beat);const j=judge(t-target,target);counts[j.label]++;if(j.base){combo++;maxCombo=Math.max(combo,maxCombo);score+=Math.round(j.base*(1+Math.min(Math.floor((combo-1)/5),4)*.25));}else combo=0;}return {score,maxCombo,combo,counts};}
export function validateHits(hits){return Array.isArray(hits)&&hits.length<=300&&hits.every((t,i)=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<RULES.duration&&(i===0||t-hits[i-1]>=RULES.minInputGap));}
export function normalizeNickname(value){if(typeof value!=='string')return null;const name=value.normalize('NFKC').trim();return /^[\p{L}\p{N}_ -]{2,12}$/u.test(name)?name:null;}
