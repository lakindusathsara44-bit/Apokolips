import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
const canvas=document.getElementById('apoloniaAvatar'),host=document.getElementById('globeWrap');
if(canvas&&host){
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(0,0,7.8);
const root=new THREE.Group();scene.add(root);
const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`
attribute float glyph; attribute float psize; attribute float phase;
uniform float uTime; uniform float uEnergy; uniform float uState;
varying float vGlyph; varying float vGlow;
void main(){vGlyph=glyph;vGlow=.55+.45*sin(uTime*1.4+phase);vec3 p=position;
p+=normal*(.012*sin(uTime*1.2+phase)+uEnergy*.018*sin(uTime*5.0+phase));
vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
gl_PointSize=clamp(psize*(300.0/-mv.z)*(1.0+uEnergy*.2),1.2,10.0);}
`,fragmentShader:`
uniform float uTime; uniform float uEnergy; uniform float uState;
varying float vGlyph; varying float vGlow;
void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float alpha=0.0;
if(vGlyph<.5){alpha=1.0-smoothstep(.25,.48,d);}
else if(vGlyph<1.5){float head=1.0-smoothstep(.18,.34,length(p-vec2(-.04,-.08)));float tail=1.0-smoothstep(.04,.16,length(p-vec2(.12,.13)));alpha=max(head,tail);}
else{alpha=1.0-smoothstep(.32,.49,d);}
if(alpha<.04)discard;
vec3 c=mix(vec3(.28,.62,1.0),vec3(.48,.94,1.0),vGlow);
if(uState>.5&&uState<1.5)c=mix(c,vec3(.38,1.0,.82),.55);
if(uState>1.5&&uState<2.5)c=mix(c,vec3(.62,.68,1.0),.5);
gl_FragColor=vec4(c,alpha*(.72+.28*vGlow));}
`,uniforms:{uTime:{value:0},uEnergy:{value:.08},uState:{value:0}}});
const groups={head:new THREE.Group(),torso:new THREE.Group(),arms:new THREE.Group(),face:new THREE.Group()};
root.add(groups.head,groups.torso,groups.arms,groups.face);
function ellipsoidPoints(parent,center,radii,count,seed=1,face=false,rotationZ=0){let state=seed>>>0;const rand=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};const pos=[],norm=[],glyph=[],size=[],phase=[];
for(let i=0;i<count;i++){const z=rand()*2-1,a=rand()*Math.PI*2,q=Math.sqrt(1-z*z);const n=new THREE.Vector3(q*Math.cos(a),z,q*Math.sin(a));const p=new THREE.Vector3(n.x*radii[0],n.y*radii[1],n.z*radii[2]);if(face&&p.z<0)p.z=-p.z;
p.add(new THREE.Vector3(...center));pos.push(p.x,p.y,p.z);norm.push(n.x,n.y,n.z);glyph.push(rand()<.43?0:rand()<.76?1:2);size.push(2.3+rand()*2.4);phase.push(rand()*6.28);}
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('glyph',new THREE.Float32BufferAttribute(glyph,1));g.setAttribute('psize',new THREE.Float32BufferAttribute(size,1));g.setAttribute('phase',new THREE.Float32BufferAttribute(phase,1));const points=new THREE.Points(g,mat);parent.add(points);return points;}
function limb(parent,a,b,r,count,seed){const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);return ellipsoidPoints(parent,mid,[r,len/2+r,r],count,seed,false,-Math.atan2(b[0]-a[0],b[1]-a[1]));}
ellipsoidPoints(groups.head,[0,1.48,0],[.58,.72,.48],1900,12,true);
ellipsoidPoints(groups.torso,[0,.12,0],[.69,.91,.39],2300,22);
ellipsoidPoints(groups.torso,[0,-.62,0],[.53,.35,.34],700,32);
ellipsoidPoints(groups.torso,[0,.83,0],[.72,.25,.36],550,42);
limb(groups.arms,[-.68,.77,0],[-.92,.02,.02],.23,560,52);limb(groups.arms,[-.92,.02,.02],[-1.02,-.67,.06],.18,480,62);
limb(groups.arms,[.68,.77,0],[.92,.02,.02],.23,560,72);limb(groups.arms,[.92,.02,.02],[1.02,-.67,.06],.18,480,82);
// Upper-body-only avatar: no pelvis, legs, or feet are generated.
ellipsoidPoints(groups.face,[-.2,1.58,.455],[.055,.045,.025],35,152,true);ellipsoidPoints(groups.face,[.2,1.58,.455],[.055,.045,.025],35,162,true);
const mouthGroup=new THREE.Group();mouthGroup.position.set(0,1.25,0);groups.face.add(mouthGroup);const mouth=ellipsoidPoints(mouthGroup,[0,0,.47],[.19,.018,.018],95,172,true);
groups.face.position.y=0;
root.position.y=-.48;
let targetYaw=0,currentYaw=0,energy=.08,state=0,mouthOpen=0,targetMouth=0,clock=new THREE.Clock();
window.addEventListener('apolonia:state',e=>{const s=e.detail?.state;state=s==='listening'?1:s==='thinking'?2:s==='speaking'?3:0;mat.uniforms.uState.value=state;});
window.addEventListener('apolonia:phoneme',e=>{const v=e.detail?.intensity||.2;energy=Math.min(1,v);targetMouth=state===3?(.18+v*.85):0;});
window.addEventListener('apolonia:mouth',e=>{targetMouth=Math.max(0,Math.min(1,e.detail?.open||0));});
window.addEventListener('apolonia:turn',e=>{const d=e.detail?.direction;targetYaw=d==='left'?.62:d==='right'?-.62:0;});
function resize(){const r=host.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);resize();
function frame(){requestAnimationFrame(frame);const t=clock.getElapsedTime();currentYaw+=(targetYaw-currentYaw)*.045;root.rotation.y=currentYaw+Math.sin(t*.35)*.035;groups.head.rotation.y=Math.sin(t*.7)*.045;groups.head.rotation.x=Math.sin(t*.55)*.018;groups.arms.rotation.z=Math.sin(t*.8)*.018;root.position.y=-.48+Math.sin(t*1.2)*.035;
mouthOpen+=(targetMouth-mouthOpen)*.25;mouth.scale.y=Math.max(.45,1+mouthOpen*5);mouth.position.y=0;
energy+=(.08-energy)*.025;mat.uniforms.uTime.value=t;mat.uniforms.uEnergy.value=energy;renderer.render(scene,camera);}
frame();
}