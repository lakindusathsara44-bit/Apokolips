(() => {
'use strict';
const canvas=document.getElementById('particleHumanoid');
const stage=document.getElementById('globeWrap');
if(!canvas||!stage)return;
const ctx=canvas.getContext('2d');
const glyphs=['. ',',','•'];
let width=720,height=720,ratio=1,turn=0,targetTurn=0,tilt=0,targetTilt=0,seed=0;
const particles=[];
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function add(x,y,size){particles.push({x,y,size,g:glyphs[Math.floor(rand()*glyphs.length)],phase:rand()*Math.PI*2,speed:.3+rand()*.8,drift:rand()*5+1});}
function ellipse(cx,cy,rx,ry,count,size){for(let i=0;i<count;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand()),x=cx+Math.cos(a)*rx*r,y=cy+Math.sin(a)*ry*r;add(x,y,size);}}
function line(x1,y1,x2,y2,count,size){for(let i=0;i<count;i++){const t=rand();add(x1+(x2-x1)*t+(rand()-.5)*.018,y1+(y2-y1)*t+(rand()-.5)*.018,size);}}
function build(){seed=171;particles.length=0;
 // head and facial constellation
 ellipse(.5,.205,.105,.135,88,13);
 // neck, shoulders, torso
 line(.47,.32,.47,.38,13,12);line(.53,.32,.53,.38,13,12);
 line(.47,.37,.34,.43,25,14);line(.53,.37,.66,.43,25,14);
 ellipse(.5,.53,.145,.19,100,15);
 // arms, hands
 line(.35,.43,.25,.63,36,13);line(.65,.43,.75,.63,36,13);
 ellipse(.24,.66,.035,.045,14,12);ellipse(.76,.66,.035,.045,14,12);
 // hips and legs
 ellipse(.5,.72,.13,.075,38,13);
 line(.44,.75,.39,.94,40,13);line(.56,.75,.61,.94,40,13);
 // facial eyes, nose and mouth made only from punctuation
 for(let i=0;i<5;i++){add(.455+i*.022,.19,.9);add(.545-i*.022,.19,.9);}
 for(let i=0;i<5;i++)add(.5+(i-2)*.012,.235,.85);
 for(let i=0;i<9;i++)add(.46+i*.01,.27,.95);
}
function resize(){const r=canvas.getBoundingClientRect();ratio=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
function draw(t){ctx.clearRect(0,0,width,height);turn+=(targetTurn-turn)*.055;tilt+=(targetTilt-tilt)*.06;
const state=stage.dataset.state||'idle',talk=state==='speaking',listen=state==='listening',cx=width/2,cy=height*.49,scale=Math.min(width,height)*.86;
const breathing=1+Math.sin(t*.0012)*.008;
ctx.save();ctx.translate(cx,cy);ctx.rotate(turn);ctx.transform(1,0,Math.sin(turn)*.12,1,0,0);ctx.translate(0,tilt*scale*.05);
for(let i=0;i<particles.length;i++){const p=particles[i],wave=Math.sin(t*.001*p.speed+p.phase),pulse=talk?Math.sin(t*.018+p.phase)*.012:listen?Math.sin(t*.004+p.phase)*.006:wave*.003;
let x=(p.x-.5)*scale*breathing,y=(p.y-.49)*scale*breathing;
x+=Math.sin(t*.0008+p.phase)*p.drift*(talk?1.6:.7);y+=Math.cos(t*.0007+p.phase)*p.drift*.55;
if(talk&&p.y>.25&&p.y<.29&&p.x>.44&&p.x<.56)y+=Math.sin(t*.025)*scale*.009;
const alpha=.55+(.35*(.5+.5*wave));ctx.globalAlpha=alpha;ctx.fillStyle=listen?'#9fffe8':'#8cecff';ctx.shadowColor=listen?'#75ffdc':'#48bfff';ctx.shadowBlur=talk?13:8;
ctx.font=`${Math.max(8,p.size*(scale/360)*(1+pulse))}px "Space Mono",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.g,x,y);}
ctx.restore();ctx.globalAlpha=1;ctx.shadowBlur=0;
if(Math.abs(targetTurn-turn)>.002||Math.abs(targetTilt-tilt)>.002){}requestAnimationFrame(draw);}
window.addEventListener('resize',resize);
window.addEventListener('apolonia:heard',e=>{const text=String(e.detail?.text||'').toLowerCase();if(/turn left|look left|face left/.test(text))targetTurn=-.42;else if(/turn right|look right|face right/.test(text))targetTurn=.42;else if(/face forward|look forward|turn back|straight/.test(text))targetTurn=0;if(/look up|raise your head/.test(text))targetTilt=-.8;else if(/look down|lower your head/.test(text))targetTilt=.8;else if(/look forward|face forward/.test(text))targetTilt=0;});
build();resize();requestAnimationFrame(draw);
})();