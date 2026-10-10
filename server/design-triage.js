// Triage rules from the Sanjeevani Operations Agent design, copied unchanged so the screens show the same
// categories, scores and reasons. Danger signs set the category; symptoms are never added up.
// (assess.js adds a safety net on top: see there.)
'use strict';
const LV={Emergency:4,High:3,Medium:2,Low:1},LN=['','Low','Medium','High','Emergency'],LC={Emergency:'t-r',High:'t-o',Medium:'t-a',Low:'t-g'};
const HIST=['Heart disease','Blood thinners','Pregnancy','Diabetes','Lung disease','Cancer','Kidney disease','Previous stroke'];
// [pattern, category 1-4, reason, department, danger sign?]
const SIGNS=[
[/heart attack|myocardial|\bstemi\b/,4,'Described as a heart attack','Cardiology',1],
[/unconscious|unresponsive|not breathing|collaps|cardiac arrest|no pulse/,4,'Unresponsive or collapsed: possible cardiac or breathing arrest','Emergency',1],
[/stroke|face droop|slurred|(right|left) side (is )?weak|paraly|sudden weakness/,4,'Stroke signs (time-critical)','General Medicine',1],
[/heavy bleeding|bleeding (a lot|heavily|profus)|blood loss|vomit(ing)? blood|coughing blood/,4,'Heavy bleeding','Surgery',1],
[/can'?t breathe|cannot breathe|struggling to breathe|gasping|blue(ish)? lips|bluish|cyanos/,4,'Severe breathing difficulty or blue lips','General Medicine',1],
[/allergic reaction|swelling of (the )?(face|throat|lips)|anaphyla/,4,'Possible severe allergic reaction','Emergency',1],
[/seizure|convuls|\bfits?\b/,4,'Seizure','General Medicine',1],
[/head injury|hit (his|her|the|my) head|road accident|\brta\b|fell from (a )?(height|roof|building)/,4,'Major trauma or head injury','Surgery',1],
[/breathing (very )?fast|short(ness)? of breath|breathless|difficulty breathing|wheez/,3,'Breathing difficulty','General Medicine'],
[/chest (pain|pressure|tightness|heaviness|discomfort)|crushing/,3,'Chest pain or pressure needs an urgent ECG','Cardiology'],
[/deformed|open fracture|bone (is )?(sticking|visible)/,3,'Deformed or open fracture','Orthopaedics'],
[/severe (abdominal|stomach|belly)|appendic|rigid abdomen/,3,'Severe abdominal pain','Surgery'],
[/fainted|syncope|passed out|black(ed)? out/,2,'Fainting episode','Cardiology'],
[/palpitat|racing (heart|heartbeat)|heart (is )?racing|skipping|irregular (heart)?beat|fluttering/,2,'Palpitations','Cardiology'],
[/fracture|broken (leg|arm|bone|wrist)|sprain/,2,'Suspected fracture or sprain','Orthopaedics'],
[/dehydrat|high fever/,2,'Dehydration or high fever','General Medicine'],
[/high (blood pressure|bp)|bp (is |was )?high/,2,'High blood pressure','Cardiology'],
[/severe pain|unbearable|worst pain|a lot of pain/,2,'Severe pain',''],
[/stomach pain|abdominal pain|belly pain/,2,'Abdominal pain','Surgery'],
[/fever|vomit|diarr|loose motion|dizz|giddy|headache/,1,'Fever, vomiting, dizziness or headache','General Medicine'],
[/back pain|knee pain|joint pain/,1,'Musculoskeletal pain','Orthopaedics'],
[/cough|cold|sore throat|runny nose|rash|itch|routine|follow.?up|check.?up|review|dressing|refill/,1,'Minor or routine complaint','']];
const band=(v,t,d)=>{for(const[l,p]of t)if(v<=l)return p;return d};
const num=v=>v!==''&&v!=null&&!isNaN(+v);
function analyse(p){const x=(p.text||'').toLowerCase(),a=+p.age||0,h=p.hist||[],F=[],V=[],N=[];let base=1,dng=0,top='',dd={};
 for(const[re,l,w,d,dg]of SIGNS){const m=x.match(re);if(!m)continue;if(/\b(no|not|denies|denied|without|never)\b/.test(x.slice(Math.max(0,m.index-28),m.index)))continue;F.push([l,w]);if(d)dd[d]=Math.max(dd[d]||0,l);if(dg)dng=1;if(l>base){base=l;top=w}}
 if(F.some(f=>/^Chest pain/.test(f[1]))&&/sweat|clammy|\barm\b|jaw|shoulder|spreading|radiat|nausea|breathless|short of breath/.test(x)){top='Chest pain with sweating, spread to the arm or jaw, or breathlessness: possible heart attack';F.push([4,top]);base=4;dng=1;dd.Cardiology=4}
 let vl=1,news=null;
 if(a>0&&a<=12){if(num(p.spo2)&&+p.spo2<92){vl=4;V.push('Low oxygen level for a child')}if((num(p.rr)&&+p.rr>40&&a<=5)||(num(p.hr)&&+p.hr>(a<=5?160:140))){vl=Math.max(vl,3);V.push('Breathing or pulse rate high for age')}}
 else if([p.spo2,p.hr,p.sys,p.rr].some(num)){const q=[];
  if(num(p.rr))q.push(['Resp rate',p.rr,band(+p.rr,[[8,3],[11,1],[20,0],[24,2]],3)]);
  if(num(p.spo2))q.push(['SpO2',p.spo2,band(+p.spo2,[[91,3],[93,2],[95,1]],0)]);
  if(num(p.sys))q.push(['Systolic BP',p.sys,band(+p.sys,[[90,3],[100,2],[110,1],[219,0]],3)]);
  if(num(p.hr))q.push(['Pulse',p.hr,band(+p.hr,[[40,3],[50,1],[90,0],[110,1],[130,2]],3)]);
  const tot=q.reduce((s,e)=>s+e[2],0),mx=Math.max(0,...q.map(e=>e[2]));news={total:tot,parts:q};vl=tot>=7?4:tot>=5?3:mx===3?2:1;
  if((num(p.spo2)&&+p.spo2<90)||(num(p.sys)&&+p.sys<90)||(num(p.hr)&&+p.hr>=140)){vl=4;V.push('Vital sign past a hard limit (SpO2 under 90, systolic under 90 or pulse 140+)')}else if(vl>1)V.push('NEWS2 vital-sign score '+tot)}
 let lvl=Math.max(base,vl);if(vl>base&&V.length)top=V[0];
 if((a>=65||(a>0&&a<=5)||h.length)&&lvl<3){lvl++;N.push('Age or medical history raised the priority one step')}
 if(/mild|slight|occasional|relieved by rest|no pain now|settled|resolved/.test(x)&&!dng&&vl<2&&lvl>1){lvl--;N.push('Mild or settled symptoms lowered the priority one step')}
 const miss=[];if(![p.spo2,p.hr,p.sys,p.rr].some(num))miss.push('vital signs');if(!a)miss.push('age');if(!h.length)miss.push('history flags (none ticked)');
 const bonus=Math.min(24,F.length*4+(news?news.total*2:0)+h.length*2+(a>=65||(a>0&&a<=5)?3:0)+(dng?6:0));
 const top2=Object.entries(dd).sort((u,v)=>v[1]-u[1])[0],why=[...new Set([...F.sort((u,v)=>v[0]-u[0]).map(f=>f[1]),...V,...N])];
 return{level:LN[lvl],score:[0,0,25,50,75][lvl]+bonus,deciding:top||(F.length?F[0][1]:'No urgent signs found in the description'),why:why.length?why:['No urgent signs found in the description'],news,missing:miss,dept:p.dept&&p.dept!=='Auto-detect'?p.dept:top2?top2[0]:'Emergency'}}

module.exports = { analyse, LV, LN, LC, HIST, SIGNS };
