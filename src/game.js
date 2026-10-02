'use strict';const CORE=(()=>{const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;const HV=[[0,-1],[-1,0],[0,1],[1,0]],hv=H=>HV[(H%4+4)%4],mod4=H=>(H%4+4)%4
;function rng32(a){return function(){a|=0;a=a+1831565813|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const GR=30,JV=11,PADV=17,PH=1.75,SH=.8,HW=.3,LATMAX=9.5;class Course{constructor(seed){this.seed=seed;this.rng=rng32(seed);this.rng2=rng32(seed^2654435769)
;this.chunks=[];this.base=0;this.n=0;this.c={x:0,y:0,z:0,H:0};this.dist=0;this.last='';this.last2='';this.sinceCorner=0;this.sinceCp=0;this.lastDir=0
;this.script=['run','hurdles','gaps','corner','run','stairs','bars','corner','run'];this.onDrop=null;const ch=this.newChunk('start')
;this.add(ch,this.lb(-5,5,-10,36,-1.4,0,0));ch.cp={x:0,y:0,z:-1,H:0,ci:ch.i,dist:0};this.adv(ch,36);this.finish(ch);this.chunks.push(ch)}r(a,b){return a+(b-a)*this.rng()}
ri(a,b){return Math.floor(this.r(a,b+1))}diff(){return clamp(this.dist/2800,0,1)}W(){return 7.4-3.2*this.diff()}vplan(){return 15+8.5*this.diff()}get(i){
return this.chunks[i-this.base]}lb(l0,l1,f0,f1,y0,y1,k,s){const c=this.c,h=hv(c.H),hx=h[0],hz=h[1],rx=-hz,rz=hx
;const ax=c.x+rx*l0+hx*f0,az=c.z+rz*l0+hz*f0,bx=c.x+rx*l1+hx*f1,bz=c.z+rz*l1+hz*f1;return{x0:Math.min(ax,bx),x1:Math.max(ax,bx),z0:Math.min(az,bz),z1:Math.max(az,bz),
y0:c.y+y0,y1:c.y+y1,k:k||0,s:s||0}}add(ch,b){ch.boxes.push(b);return b}addV(ch,b){ch.vboxes.push(b)}adv(ch,len){const h=hv(this.c.H);this.c.x+=h[0]*len;this.c.z+=h[1]*len
;this.dist+=len;ch.len+=len;ch.wps.push([this.c.x,this.c.y,this.c.z])}hp(f){const c=this.c,h=hv(c.H);return{x:c.x+h[0]*f,z:c.z+h[1]*f,ax:h[0],az:h[1]}}
gate(ch,f,lat,yc,w,hh,o){const c=this.c,h=hv(c.H),hx=h[0],hz=h[1],rx=-hz,rz=hx;o=o||{};const g={x:c.x+hx*f+rx*lat,y:c.y+yc,z:c.z+hz*f+rz*lat,ax:hx,az:hz,rx:rx,rz:rz,
hw:w/2,hh:hh/2,need:o.need||null,prev:undefined,done:false,vis:o.vis!==false};ch.gates.push(g);if(g.vis){
const t=.09,mk=(a,b,c0,d,e,f2)=>this.addV(ch,this.lb(a,b,c0,d,e,f2,4));mk(lat-w/2-t,lat-w/2+t,f-t,f+t,yc-hh/2,yc+hh/2);mk(lat+w/2-t,lat+w/2+t,f-t,f+t,yc-hh/2,yc+hh/2)
;mk(lat-w/2-t,lat+w/2+t,f-t,f+t,yc+hh/2-t,yc+hh/2+t)}}newChunk(name){const c=this.c;return{i:this.n++,name:name,boxes:[],vboxes:[],decor:[],gates:[],corner:null,
hint:null,cp:null,wps:[[c.x,c.y,c.z]],len:0,st:{x:c.x,y:c.y,z:c.z,H:c.H},act:Math.floor(this.dist/1e3)%4,bb:null,mesh:null,ymin:0}}finish(ch){
let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,ym=1e9;for(const b of ch.boxes){x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);z0=Math.min(z0,b.z0);z1=Math.max(z1,b.z1)
;if(b.k!==1)ym=Math.min(ym,b.y1)}ch.bb={x0:x0,x1:x1,z0:z0,z1:z1};ch.ymin=ym===1e9?0:ym;this.decor(ch)}decor(ch){
const r=this.rng2,st=ch.st,h=hv(st.H),hx=h[0],hz=h[1],rx=-hz,rz=hx,len=Math.max(ch.len,20),n=1+Math.floor(r()*2);for(let i=0;i<n;i++){
const side=r()<.5?-1:1,f=r()*len,lat=side*(17+r()*55),w=5+r()*13,d=5+r()*13,cx=st.x+hx*f+rx*lat,cz=st.z+hz*f+rz*lat,top=st.y-12-r()*22;ch.decor.push({x0:cx-w/2,x1:cx+w/2,
z0:cz-d/2,z1:cz+d/2,y0:top-70-r()*60,y1:top,k:3,s:r()<.14?1:0})}if(r()<.2){
const side=r()<.5?-1:1,f=r()*len,lat=side*(40+r()*60),w=10+r()*16,d=10+r()*16,cx=st.x+hx*f+rx*lat,cz=st.z+hz*f+rz*lat,y0=st.y+26+r()*30;ch.decor.push({x0:cx-w/2,
x1:cx+w/2,z0:cz-d/2,z1:cz+d/2,y0:y0,y1:y0+2+r()*3,k:3,s:0})}}next(){const name=this.script.length?this.script.shift():this.pick();const ch=this.newChunk(name)
;this['pat_'+name](ch);this.finish(ch);this.chunks.push(ch);this.last2=this.last;this.last=name;this.sinceCorner=name==='corner'?0:this.sinceCorner+1
;this.sinceCp=name==='cp'?0:this.sinceCp+1;return ch}pick(){const d=this.diff();if(this.last==='corner')return'run';if(this.sinceCp>=10&&this.last!=='cp')return'cp'
;if(this.sinceCorner>=3&&(this.sinceCorner>=5||this.rng()<.6))return'corner';if(['zig','slalom','pad','beam'].includes(this.last)&&this.rng()<.5)return'run'
;const W=[['gaps',2],['stairs',1.4],['bars',1.2],['hurdles',1.2],['beam',d>.04?1.5:.3],['zig',d>.07?1.6:0],['slalom',d>.1?1.3:0],['pad',d>.12?1.2:0],['run',this.last==='run'?0:.5]]
;let tot=0;for(const w of W){if(w[0]===this.last)w[1]*=.15;if(w[0]===this.last2)w[1]*=.5;tot+=w[1]}let x=this.rng()*tot;for(const w of W){x-=w[1];if(x<=0)return w[0]}
return'run'}slab(ch,w,f0,f1){this.add(ch,this.lb(-w/2,w/2,f0,f1,-1.4,0,0))}pat_run(ch){const len=this.r(14,24);this.slab(ch,this.W(),0,len);this.adv(ch,len)}pat_gaps(ch){
const d=this.diff(),w=this.W(),v=this.vplan(),n=this.ri(2,3+Math.floor(d*3));for(let i=0;i<n;i++){const L=Math.max(7,v*this.r(.36,.48));this.slab(ch,w,0,L)
;if(i===0)ch.hint=Object.assign({type:'jump'},this.hp(L));let g=clamp(v*this.r(.19,.3),4,8.6),dy=0;const q=this.rng();if(q<.2){dy=-this.r(1.5,3);g*=1.15
}else if(q<.36&&this.c.y<8){dy=this.r(.5,1);g*=.88}this.gate(ch,L+g/2,0,1.8+dy*.5,Math.min(w,4.6),3);this.adv(ch,L+g);this.c.y+=dy}const L2=this.r(9,13)
;this.slab(ch,w,0,L2);this.adv(ch,L2)}pat_stairs(ch){
const v=this.vplan(),w=this.W(),up=this.c.y<10&&(this.c.y<-3||this.rng()<.62),n=this.ri(3,4+Math.floor(this.diff()*2)),hs=(up?1:-1)*this.r(.85,1.1),L0=this.r(10,14)
;this.slab(ch,w,0,L0);ch.hint=Object.assign({type:'jump'},this.hp(L0));this.adv(ch,L0);for(let i=0;i<n;i++){const L=Math.max(8,v*this.r(.4,.5));this.c.y+=hs
;this.slab(ch,w,0,L);if(i%2===0)this.gate(ch,0,0,1.9,Math.min(w,4.4),3.2);this.adv(ch,L)}const L2=this.r(8,12);this.slab(ch,w,0,L2);this.adv(ch,L2)}pat_zig(ch){
const d=this.diff(),n=this.ri(4,6+Math.floor(d*3)),pw=lerp(4.2,3.2,d),off=2.4,Lp=11,stp=7;let side=this.rng()<.5?-1:1;this.slab(ch,pw+2,0,8);ch.hint=Object.assign({
type:'dash'},this.hp(2));this.adv(ch,8);for(let i=0;i<n;i++){const lat=side*off;this.add(ch,this.lb(lat-pw/2,lat+pw/2,0,Lp,-1.4,0,0))
;if(i<n-1)this.gate(ch,Lp-1.5,0,1.5,3.2,2.6);this.adv(ch,i===n-1?Lp:stp);side=-side}const L=this.r(9,12);this.slab(ch,pw+2,0,L);this.adv(ch,L)}pat_beam(ch){
const d=this.diff(),lam=this.r(38,52),A=this.r(1.7,2.4)*(.85+.3*d),bw=lerp(2.9,2.1,d),len=Math.max(1,Math.round(this.r(50,75)/(lam/2)))*(lam/2),stp=2.6
;this.slab(ch,this.W(),0,6);ch.hint=Object.assign({type:'steer'},this.hp(6));this.adv(ch,6);for(let f=0,k=0;f<len;f+=stp,k++){
const fm=Math.min(stp,len-f),lat=A*Math.sin(2*Math.PI*(f+fm/2)/lam);this.add(ch,this.lb(lat-bw/2,lat+bw/2,f,f+fm,-1.4,0,0))
;if(k%6===3)this.gate(ch,f+fm/2,lat,1.4,2.8,2.4)}this.adv(ch,len);const L=this.r(8,12);this.slab(ch,this.W(),0,L);this.adv(ch,L)}pat_slalom(ch){
const w=Math.max(this.W(),6.6),len=this.r(52,72);this.slab(ch,w,0,len);let side=this.rng()<.5?-1:1;for(let f=16,i=0;f<len-8;f+=11,i++){const lat=side*1.7
;this.add(ch,this.lb(lat-1,lat+1,f,f+2,0,3.6,1));if(i===0)ch.hint=Object.assign({type:'steer'},{x:this.hp(f).x,z:this.hp(f).z,ax:this.hp(f).ax,az:this.hp(f).az})
;this.gate(ch,f+1,-side*1.5,1.4,2.4,2.4);side=-side}this.adv(ch,len)}pat_bars(ch){const w=this.W(),n=this.ri(2,3+(this.diff()>.4?1:0)),total=12+n*17+4
;this.slab(ch,w,0,total);for(let i=0,f=12;i<n;i++,f+=17){this.add(ch,this.lb(-w/2,w/2,f,f+.8,.95,1.7,1));this.add(ch,this.lb(-w/2-.9,-w/2,f-.1,f+.9,-1.4,2.4,0))
;this.add(ch,this.lb(w/2,w/2+.9,f-.1,f+.9,-1.4,2.4,0));this.gate(ch,f+.4,0,.5,w,.8,{need:'slide',vis:false});if(i===0)ch.hint=Object.assign({type:'slide'},this.hp(f))}
this.adv(ch,total)}pat_hurdles(ch){const w=this.W(),d=this.diff(),n=this.ri(2,3+Math.floor(d*3)),total=11+n*15+3;this.slab(ch,w,0,total);for(let i=0,f=11;i<n;i++,f+=15){
const hh=this.r(.65,.95),part=this.rng()<.35&&d>.1;this.add(ch,this.lb(-w/2,part?w/2-2.4:w/2,f,f+.9,0,hh,1));this.gate(ch,f+.45,0,.6,w,1,{need:'air',vis:false})
;if(i===0)ch.hint=Object.assign({type:'jump'},this.hp(f))}this.adv(ch,total)}pat_pad(ch){const w=this.W(),v=this.vplan(),L1=15,G=clamp(.8*(v-8),7,14);this.slab(ch,w,0,L1)
;this.add(ch,this.lb(-1.7,1.7,L1-8,L1-4.6,0,.12,2));this.gate(ch,L1-8+v*.567,0,5,4,3.6);this.adv(ch,L1+G);this.c.y+=.7;const L=14+v*.35;this.slab(ch,w,0,L);this.adv(ch,L)
}pat_corner(ch){const S=12,c=this.c,h=hv(c.H);const dir=this.lastDir&&this.rng()<.65?-this.lastDir:this.rng()<.5?1:-1;this.lastDir=dir
;this.add(ch,this.lb(-S/2,S/2,0,S,-1.4,0,6));this.add(ch,this.lb(-S/2,S/2,S,S+1.2,-1.4,5.5,0));ch.corner={tx:c.x,tz:c.z,H:c.H,dir:dir,S:S,cx:c.x+h[0]*S/2,cz:c.z+h[1]*S/2,
used:false};ch.hint={type:'turn',dir:dir,x:c.x-h[0]*4,z:c.z-h[1]*4,ax:h[0],az:h[1]};const nH=c.H+dir,nh=hv(nH);ch.len+=S;this.dist+=S
;ch.wps.push([ch.corner.cx,c.y,ch.corner.cz]);this.c={x:ch.corner.cx+nh[0]*S/2,y:c.y,z:ch.corner.cz+nh[1]*S/2,H:nH};ch.wps.push([this.c.x,this.c.y,this.c.z])}pat_cp(ch){
const w=Math.max(this.W(),6),L=16,c=this.c,h=hv(c.H);this.slab(ch,w,0,L);const pc=.7;this.addV(ch,this.lb(-w/2-.6,-w/2,L/2-pc/2,L/2+pc/2,-1.4,6.4,4))
;this.addV(ch,this.lb(w/2,w/2+.6,L/2-pc/2,L/2+pc/2,-1.4,6.4,4));this.addV(ch,this.lb(-w/2-.6,w/2+.6,L/2-pc/2,L/2+pc/2,6.4,7.1,4));ch.cp={x:c.x+h[0]*3,y:c.y,z:c.z+h[1]*3,
H:c.H,ci:ch.i,dist:0};this.adv(ch,L)}locate(P){let i=P.ci;for(let k=0;k<3;k++){const n=this.get(i+1)
;if(n&&P.x>n.bb.x0-3&&P.x<n.bb.x1+3&&P.z>n.bb.z0-3&&P.z<n.bb.z1+3)i++;else break}P.ci=i}trim(min){while(this.base<min&&this.chunks.length>3){const d=this.chunks.shift()
;this.base++;if(this.onDrop)this.onDrop(d)}}resetFrom(ci){for(let i=Math.max(ci,this.base);i<this.base+this.chunks.length;i++){const ch=this.get(i)
;for(const g of ch.gates){g.done=false;g.prev=undefined}if(ch.corner)ch.corner.used=false}}}function newPlayer(cp){return{x:cp.x,y:cp.y,z:cp.z,vy:0,H:cp.H,speed:0,
speedT:15,lat:0,dashV:0,dashCd:0,grounded:false,coyote:0,jumpBuf:0,sliding:false,slideT:0,slideQ:0,ph:PH,alive:true,ci:cp.ci||0,dist:0,steer:0,turnLock:0,turnBuf:null,
q:[],ev:[],stride:0,stumbleT:0}}function hitB(boxes,x,y,z,h,hw,f){for(let i=0;i<boxes.length;i++){const b=boxes[i]
;if(x+hw>b.x0&&x-hw<b.x1&&z+hw>b.z0&&z-hw<b.z1&&y+h>b.y0&&y<b.y1&&(!f||f(b)))return b}return null}const notHaz=b=>b.k!==1;function findCorner(C,P){
for(let i=P.ci-1;i<=P.ci+1;i++){const ch=C.get(i);if(ch&&ch.corner&&!ch.corner.used&&mod4(ch.corner.H)===mod4(P.H))return ch.corner}return null}function doTurn(P,c,f){
c.used=true;P.H+=c.dir;const nh=hv(P.H),rx=-nh[1],rz=nh[0],o=(P.x-c.cx)*rx+(P.z-c.cz)*rz;if(Math.abs(o)<7.5)P.dashV=clamp(P.dashV-o*6,-45,45);P.lat=0;P.turnLock=.34
;P.ev.push({t:'turn',dir:c.dir,perfect:Math.abs(f-c.S/2)<2.6})}function stepP(C,P,dt){const ev=P.ev;ev.length=0;if(!P.alive)return;C.locate(P);const boxes=[]
;for(let i=P.ci-1;i<=P.ci+2;i++){const ch=C.get(i);if(ch)for(const b of ch.boxes)boxes.push(b)}P.jumpBuf-=dt;P.coyote-=dt;P.dashCd-=dt;P.turnLock-=dt;P.slideQ-=dt
;P.stumbleT-=dt;if(P.turnBuf){P.turnBuf.t-=dt;if(P.turnBuf.t<=0){P.turnBuf=null;ev.push({t:'turnmiss'})}}for(const a of P.q){
if(a.t==='jump')P.jumpBuf=.17;else if(a.t==='slide'){if(P.grounded||P.coyote>0){if(!P.sliding){P.sliding=true;P.slideT=.75;ev.push({t:'slide'})}}else{
P.vy=Math.min(P.vy,-15);P.slideQ=.45;ev.push({t:'dive'})}}else if(a.t==='dash'){if(P.dashCd<=0){P.dashV=clamp(P.dashV+a.dir*15,-30,30);P.dashCd=.42;ev.push({t:'dash',
dir:a.dir})}}else if(a.t==='turn')P.turnBuf={dir:a.dir,t:.45}}P.q.length=0;if(P.turnBuf){const c=findCorner(C,P);if(c){if(c.dir!==P.turnBuf.dir){P.turnBuf=null;ev.push({
t:'turnwrong'})}else{const h=hv(P.H),hx=h[0],hz=h[1],rx=-hz,rz=hx,f=(P.x-c.tx)*hx+(P.z-c.tz)*hz,l=(P.x-c.tx)*rx+(P.z-c.tz)*rz;if(f>-.4&&f<c.S+1&&Math.abs(l)<c.S/2+1.5){
doTurn(P,c,f);P.turnBuf=null}}}}if(P.jumpBuf>0&&(P.grounded||P.coyote>0)){if(P.sliding&&!hitB(boxes,P.x,P.y+.001,P.z,PH,HW)){P.sliding=false;P.slideT=0}if(!P.sliding){
P.vy=JV;P.grounded=false;P.coyote=0;P.jumpBuf=0;ev.push({t:'jump'})}}if(P.sliding){P.slideT-=dt;if(P.slideT<=0&&!hitB(boxes,P.x,P.y+.001,P.z,PH,HW))P.sliding=false}
P.ph=P.sliding?SH:PH;P.speed+=(P.speedT-P.speed)*(1-Math.exp(-1.1*dt));const st=P.turnLock>0?0:P.steer,kk=P.grounded?14:6;P.lat+=(st*LATMAX-P.lat)*(1-Math.exp(-kk*dt))
;P.dashV*=Math.exp(-6*dt);const h=hv(P.H),hx=h[0],hz=h[1],rx=-hz,rz=hx,lat=P.lat+P.dashV,vx=hx*P.speed+rx*lat,vz=hz*P.speed+rz*lat
;const n=Math.max(1,Math.min(14,Math.ceil(Math.hypot(vx,vz)*dt/.2))),sd=dt/n,px0=P.x,pz0=P.z,wasG=P.grounded;let blockedF=false,landV=0,dead=null;for(let s=0;s<n;s++){
let nx=P.x+vx*sd,b=hitB(boxes,nx,P.y,P.z,P.ph,HW,notHaz);if(b){if(b.y1-P.y<=.45&&b.y1>P.y&&!hitB(boxes,nx,b.y1+.002,P.z,P.ph,HW,notHaz))P.y=b.y1+.002;else{
nx=vx>0?b.x0-HW-1e-4:b.x1+HW+1e-4;if(hx!==0&&vx*hx>0)blockedF=true}}P.x=nx;let nz=P.z+vz*sd;b=hitB(boxes,P.x,P.y,nz,P.ph,HW,notHaz);if(b){
if(b.y1-P.y<=.45&&b.y1>P.y&&!hitB(boxes,P.x,b.y1+.002,nz,P.ph,HW,notHaz))P.y=b.y1+.002;else{nz=vz>0?b.z0-HW-1e-4:b.z1+HW+1e-4;if(hz!==0&&vz*hz>0)blockedF=true}}P.z=nz
;const py=P.y;P.vy-=GR*sd;P.y+=P.vy*sd;if(P.vy<=0){b=hitB(boxes,P.x,P.y,P.z,P.ph,HW,bb=>bb.k!==1||py>=bb.y1-.12);if(b){if(P.vy<-5)landV=Math.max(landV,-P.vy);P.y=b.y1
;P.vy=0}}else{b=hitB(boxes,P.x,P.y,P.z,P.ph,HW,notHaz);if(b){P.y=b.y0-P.ph-1e-4;P.vy=0}}
const gb=P.vy<=0?hitB(boxes,P.x,P.y-.05,P.z,.05,HW-.03,bb=>bb.k!==1||P.y>=bb.y1-.12):null;P.grounded=!!gb;if(gb&&gb.k===2){P.vy=PADV;P.y+=.02;P.grounded=false;ev.push({
t:'pad'})}if(hitB(boxes,P.x,P.y+.06,P.z,P.ph-.12,HW-.06,bb=>bb.k===1)){dead='hazard';break}}if(P.grounded){P.coyote=.12;if(!wasG){ev.push({t:'land',v:landV})
;if(P.slideQ>0){P.sliding=true;P.slideT=.75;P.slideQ=0;ev.push({t:'slide'})}}}if(blockedF&&P.speed>7&&P.stumbleT<=0){ev.push({t:'impact',v:P.speed});P.speed=3
;P.stumbleT=.6}P.dist+=Math.max(0,(P.x-px0)*hx+(P.z-pz0)*hz);if(!dead){let ym=1e9;for(let i=P.ci-1;i<=P.ci+2;i++){const ch=C.get(i);if(ch)ym=Math.min(ym,ch.ymin)}
if(P.y<ym-14)dead='fall'}for(let i=P.ci;i<=P.ci+2;i++){const ch=C.get(i);if(!ch)continue;for(const g of ch.gates){if(g.done)continue;const s=(P.x-g.x)*g.ax+(P.z-g.z)*g.az
;if(g.prev===undefined){g.prev=s;continue}if(g.prev<0&&s>=0){g.done=true;const l=(P.x-g.x)*g.rx+(P.z-g.z)*g.rz,yb=P.y+P.ph/2;let ok
;if(g.need==='slide')ok=P.sliding;else if(g.need==='air')ok=!P.grounded;else ok=Math.abs(l)<=g.hw+.45&&Math.abs(yb-g.y)<=g.hh+.3;ev.push({t:'gate',ok:ok,need:g.need,
vis:g.vis})}g.prev=s}}if(dead){P.alive=false;ev.push({t:'die',why:dead})}}function respawn(C,P,cp){P.x=cp.x;P.y=cp.y+.02;P.z=cp.z;P.H=cp.H;P.vy=0;P.speed=6;P.lat=0
;P.dashV=0;P.grounded=false;P.sliding=false;P.alive=true;P.ci=cp.ci;P.turnBuf=null;P.q.length=0;P.stumbleT=0;P.turnLock=.2;P.dist=cp.dist||0;C.resetFrom(cp.ci)}return{
Course:Course,newPlayer:newPlayer,stepP:stepP,respawn:respawn,hv:hv,clamp:clamp}})();const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)]
;const clamp=CORE.clamp,lerp=(a,b,t)=>a+(b-a)*t,damp=(a,b,l,dt)=>a+(b-a)*(1-Math.exp(-l*dt));const D2R=Math.PI/180,R2D=180/Math.PI,wrap180=a=>{a%=360;if(a>180)a-=360
;if(a<-180)a+=360;return a};const isTouch=matchMedia('(pointer:coarse)').matches||'ontouchstart'in window;const isMobile=isTouch&&Math.min(screen.width,screen.height)<900
;const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;const DEF={sens:1,steer:1,invertPitch:false,mode:'auto',fov:88,roll:.5,bob:reduce?.2:.6,
shake:reduce?.2:.6,hands:true,quality:isMobile?'med':'high',music:.7,sfx:.8,haptics:true};const S=Object.assign({},DEF);try{
Object.assign(S,JSON.parse(localStorage.getItem('fs_set')||'{}'))}catch(e){}const saveS=()=>{try{localStorage.setItem('fs_set',JSON.stringify(S))}catch(e){}};let best=0
;try{best=+localStorage.getItem('fs_best')||0}catch(e){}let hintCnt={};try{hintCnt=JSON.parse(localStorage.getItem('fs_hints')||'{}')}catch(e){}const A=(()=>{
let ctx=null,master,musicBus,musicLP,sfxBus,rev,revIn,dlyIn,noiseBuf,windG,windF,slideN=null,ready=false
;const mtof=m=>440*Math.pow(2,(m-69)/12),ri=n=>Math.floor(Math.random()*n);const M={step:0,t:0,I:.2,Ti:.2,root:50,scale:[0,2,3,5,7,9,10],prog:[0,3,6,3],arp:[],motif:[],
bassPat:[0,6,10],ts:1,kickOn:true,nextProgBar:8};const PROGS=[[0,3,6,3],[0,6,3,4],[0,2,6,3],[0,4,3,6],[0,5,3,6],[0,3,4,6],[0,6,5,4]],ROOTS=[0,5,7,10,3,2]
;const deg=d=>M.root+M.scale[(d%7+7)%7]+12*Math.floor(d/7);function init(){if(ctx){if(ctx.state==='suspended')ctx.resume();return}
const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ctx=new C;master=ctx.createGain();master.gain.value=.9;const comp=ctx.createDynamicsCompressor()
;comp.threshold.value=-14;comp.ratio.value=3;comp.attack.value=.01;comp.release.value=.25;master.connect(comp);comp.connect(ctx.destination);musicBus=ctx.createGain()
;musicBus.gain.value=.55*S.music;musicLP=ctx.createBiquadFilter();musicLP.type='lowpass';musicLP.frequency.value=16e3;musicBus.connect(musicLP);musicLP.connect(master)
;sfxBus=ctx.createGain();sfxBus.gain.value=.9*S.sfx;sfxBus.connect(master);const len=ctx.sampleRate*2.6|0,ir=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){
const d=ir.getChannelData(c);let lp=0;for(let i=0;i<len;i++){lp+=(Math.random()*2-1-lp)*.35;d[i]=lp*Math.pow(1-i/len,2.6)}}rev=ctx.createConvolver();rev.buffer=ir
;revIn=ctx.createGain();const ro=ctx.createGain();ro.gain.value=.55;revIn.connect(rev);rev.connect(ro);ro.connect(master);dlyIn=ctx.createGain()
;const dly=ctx.createDelay(1);dly.delayTime.value=.2;const fb=ctx.createGain();fb.gain.value=.36;const dlp=ctx.createBiquadFilter();dlp.type='lowpass'
;dlp.frequency.value=2200;dlyIn.connect(dly);dly.connect(dlp);dlp.connect(fb);fb.connect(dly);const dout=ctx.createGain();dout.gain.value=.45;dlp.connect(dout)
;dout.connect(master);dout.connect(revIn);noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);{const d=noiseBuf.getChannelData(0)
;for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}const ws=ctx.createBufferSource();ws.buffer=noiseBuf;ws.loop=true;windF=ctx.createBiquadFilter();windF.type='bandpass'
;windF.frequency.value=700;windF.Q.value=.6;windG=ctx.createGain();windG.gain.value=0;ws.connect(windF);windF.connect(windG);windG.connect(sfxBus);ws.start()
;M.root=[45,47,48,50,52][ri(5)];genArp();genMotif();M.t=ctx.currentTime+.15;M.step=0;ready=true;setInterval(tick,28)}function note(f,t,o){
const g=ctx.createGain(),osc=ctx.createOscillator();osc.type=o.type||'sine';osc.frequency.setValueAtTime(f,t);if(o.det)osc.detune.value=o.det
;if(o.f2)osc.frequency.exponentialRampToValueAtTime(o.f2,t+(o.a||.005)+(o.d||.3));const a=o.a||.005,d=o.d||.3;g.gain.setValueAtTime(1e-4,t)
;g.gain.linearRampToValueAtTime(o.g||.2,t+a);g.gain.exponentialRampToValueAtTime(1e-4,t+a+d);let out=osc;if(o.lp){const fl=ctx.createBiquadFilter();fl.type='lowpass'
;fl.frequency.setValueAtTime(o.lp,t);if(o.lpEnd)fl.frequency.exponentialRampToValueAtTime(o.lpEnd,t+a+d);osc.connect(fl);fl.connect(g)}else osc.connect(g)
;g.connect(o.bus||musicBus);if(o.send){const s=ctx.createGain();s.gain.value=o.send;g.connect(s);s.connect(revIn)}if(o.dly){const s=ctx.createGain();s.gain.value=o.dly
;g.connect(s);s.connect(dlyIn)}osc.start(t);osc.stop(t+a+d+.06)}function noise(t,dur,o){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true
;const f=ctx.createBiquadFilter();f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||1e3,t);if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+dur)
;f.Q.value=o.q||1;const g=ctx.createGain();g.gain.setValueAtTime(1e-4,t);g.gain.exponentialRampToValueAtTime(o.g||.2,t+(o.a||.005))
;g.gain.exponentialRampToValueAtTime(1e-4,t+dur);s.connect(f);f.connect(g);g.connect(o.bus||sfxBus);if(o.send){const x=ctx.createGain();x.gain.value=o.send;g.connect(x)
;x.connect(revIn)}s.start(t,Math.random()*1.5);s.stop(t+dur+.05)}function genArp(){
const T=[[0,3,6,8,11,14],[0,2,4,6,8,10,12,14],[2,6,10,14,15],[0,3,5,8,10,13],[0,1,4,6,7,9,12,14],[0,4,7,10,12]];const tpl=T[ri(T.length)],a=Array(16).fill(null)
;let idx=ri(4);for(const s of tpl){idx=clamp(idx+ri(5)-2,0,6);a[s]=idx}M.arp=a}function genMotif(){const st=[0,3,6,8,11,14,16,19,22,24,27,30],n=4+ri(3);M.motif=[]
;let d=7+ri(4);for(let i=0;i<n;i++){d=clamp(d+ri(5)-2,5,13);M.motif.push({s:st[ri(st.length)],d:d})}}function mutMotif(){if(Math.random()<.35)return genMotif()
;const m=M.motif[ri(M.motif.length)];if(m)m.d=clamp(m.d+ri(5)-2,5,13)}function sched(st,t){const b=st%16,bar=st/16|0,I=M.I;t+=b%2?.011:0;if(b===0){if(bar>=M.nextProgBar){
M.prog=PROGS[ri(PROGS.length)];M.nextProgBar=bar+8}if(bar>0&&bar%24===0)M.root=43+((M.root-43+ROOTS[ri(ROOTS.length)])%12+12)%12;if(bar%2===0){genArp()
;M.bassPat=[0].concat([3,6,8,10,14].filter(()=>Math.random()<.5))}if(bar%4===0)mutMotif();M.kickOn=!(bar%8===7&&Math.random()<.5);const d=M.prog[bar%4]
;for(let k=0;k<4;k++){const m=deg(d+2*k);for(const dt of[-7,7])note(mtof(m),t,{type:'sawtooth',det:dt,a:1.1,d:2.9,g:.016,lp:450+I*800,send:.5})}
if(bar%5===3&&Math.random()<.6)noise(t,2.2,{type:'bandpass',f:300,f2:5e3,q:.8,g:.025,a:1.5,bus:musicBus,send:.5})}const d=M.prog[bar%4];if(M.bassPat.indexOf(b)>=0){
const m=deg(d)-12;note(mtof(m),t,{type:'sine',a:.01,d:.34,g:.26*(.55+.45*I)});note(mtof(m+12),t,{type:'triangle',a:.01,d:.22,g:.05,lp:700})}
if(I>.2&&M.kickOn&&(b%4===0||b===14&&I>.55&&Math.random()<.4||b===10&&I>.7&&Math.random()<.35)){note(150,t,{type:'sine',f2:48,a:.002,d:.13,g:.62});noise(t,.02,{
type:'highpass',f:2500,g:.08,bus:musicBus})}if(I>.35){if(b%4===2)noise(t,.04,{type:'highpass',f:7e3,g:.05+.03*I,bus:musicBus
});else if(I>.5&&b%2===1&&Math.random()<I-.3)noise(t,.025,{type:'highpass',f:8e3,g:.025,bus:musicBus})}if(I>.6&&(b===4||b===12))noise(t,.15,{f:1800,q:.9,g:.1,
bus:musicBus,send:.4});const ar=M.arp[b];if(ar!=null&&Math.random()<.45+.55*I){const lad=[d,d+2,d+4,d+6,d+7,d+9,d+11],m=deg(lad[ar])+12;note(mtof(m),t,{type:'sawtooth',
a:.004,d:.15+.1*(1-I),g:.04+.035*I,lp:3200,lpEnd:500,send:.3,dly:.5})}if(I>.25){const mb=st%32;for(const m of M.motif)if(m.s===mb&&Math.random()<.85){
const f=mtof(deg(m.d)+12);note(f,t,{type:'sine',a:.004,d:1.4,g:.07,send:.7,dly:.3});note(f*2,t,{type:'sine',a:.004,d:.5,g:.02,send:.5})}}}function tick(){
if(!ctx||ctx.state!=='running')return;M.I+=(M.Ti-M.I)*.02;const now=ctx.currentTime;if(M.t<now-.3)M.t=now+.05;while(M.t<now+.2){sched(M.step,M.t)
;M.t+=60/(104+M.I*18)/4/Math.max(.5,M.ts);M.step++}}const T=()=>ctx.currentTime;const api={init:init,get on(){return ready},setVol(){if(!ctx)return
;musicBus.gain.value=.55*S.music;sfxBus.gain.value=.9*S.sfx},intensity(v){M.Ti=clamp(v,0,1)},setTS(ts,paused){if(!ctx)return;M.ts=ts
;musicLP.frequency.setTargetAtTime(paused?500:260+16e3*Math.pow(clamp(ts,0,1),2.2),T(),.08)},wind(v,air){if(!ctx)return
;windG.gain.setTargetAtTime(Math.pow(v,1.3)*.2+(air?.05:0),T(),.1);windF.frequency.setTargetAtTime(400+v*1400,T(),.1)},step(v,alt){if(!ctx)return;const t=T()
;noise(t,.07,{f:alt?520:680,q:1.2,g:.2*v});note(alt?95:112,t,{f2:60,a:.002,d:.08,g:.16*v,bus:sfxBus})},jump(){if(!ctx)return;const t=T();noise(t,.28,{type:'highpass',
f:500,f2:2800,g:.12});note(220,t,{f2:440,a:.005,d:.2,g:.1,bus:sfxBus})},land(v){if(!ctx)return;const t=T(),k=clamp(v/16,.2,1);note(78,t,{f2:38,a:.002,d:.18,g:.5*k,
bus:sfxBus});noise(t,.12,{type:'lowpass',f:900,g:.2*k})},slideStart(){if(!ctx||slideN)return;const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true
;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1500;f.Q.value=1.4;const g=ctx.createGain();g.gain.value=0;g.gain.setTargetAtTime(.14,T(),.04)
;s.connect(f);f.connect(g);g.connect(sfxBus);s.start();slideN={s:s,g:g}},slideStop(){if(!ctx||!slideN)return;const n=slideN;slideN=null
;n.g.gain.setTargetAtTime(0,T(),.06);n.s.stop(T()+.4)},turn(){if(!ctx)return;const t=T();noise(t,.34,{f:300,f2:3600,q:1.5,g:.22,send:.3});note(880,t,{type:'square',
a:.001,d:.04,g:.05,lp:3e3,bus:sfxBus});note(66,t,{f2:40,a:.002,d:.2,g:.35,bus:sfxBus})},dash(){if(!ctx)return;noise(T(),.18,{f:900,f2:3e3,q:1.2,g:.16})},pad(){
if(!ctx)return;const t=T();note(180,t,{f2:900,type:'square',a:.003,d:.25,g:.07,lp:2400,bus:sfxBus});noise(t,.35,{type:'highpass',f:800,f2:4e3,g:.14})},gate(n){
if(!ctx)return;const t=T(),m=deg(7+n%10*1)+12;note(mtof(m),t,{type:'triangle',a:.003,d:.9,g:.14,send:.55,dly:.3,bus:sfxBus});note(mtof(m+12),t,{type:'sine',a:.003,d:.5,
g:.05,send:.5,bus:sfxBus})},miss(){if(!ctx)return;note(160,T(),{type:'triangle',f2:110,a:.003,d:.15,g:.06,bus:sfxBus})},tick(){if(!ctx)return;note(1400,T(),{
type:'square',a:.001,d:.025,g:.035,lp:4e3,bus:sfxBus})},ui(){if(!ctx)return;const t=T();note(520,t,{type:'square',a:.001,d:.05,g:.05,lp:3500,bus:sfxBus})
;note(1040,t+.04,{type:'square',a:.001,d:.07,g:.04,lp:3500,bus:sfxBus})},cp(){if(!ctx)return;const t=T();[0,4,7,11].forEach((x,i)=>note(mtof(M.root+24+x),t+i*.07,{
type:'triangle',a:.003,d:.8,g:.12,send:.6,bus:sfxBus}))},impact(){if(!ctx)return;const t=T();note(90,t,{f2:35,a:.002,d:.3,g:.6,bus:sfxBus});noise(t,.2,{type:'lowpass',
f:1200,g:.3})},death(){if(!ctx)return;const t=T();for(let i=0;i<20;i++){const t0=t+i*.011+Math.random()*.05;noise(t0,.05+Math.random()*.2,{type:'highpass',
f:2500+Math.random()*5500,g:.16,send:.4});if(i%4===0)note(2200+Math.random()*3e3,t0,{a:.001,d:.5,g:.03,send:.6,bus:sfxBus})}note(120,t,{f2:28,a:.003,d:1,g:.6,bus:sfxBus})
;musicBus.gain.cancelScheduledValues(t);musicBus.gain.setValueAtTime(.55*S.music*.15,t);musicBus.gain.linearRampToValueAtTime(.55*S.music,t+1.6)},rise(){if(!ctx)return
;noise(T(),.7,{f:200,f2:6e3,q:.9,g:.16,a:.5,send:.4})}};return api})();const K={};const In={yaw:0,pitch:0,roll:0,base:0,got:false,perm:'unknown',hist:[],gq:[],lock:0,
pLock:0,mx:0,my:0,ts:0,simTurn:0,simTurnT:0,simYaw:0,steer:0,rel:0,lastG:null,cd:{}};const modeNow=()=>S.mode==='auto'?In.got?'gyro':isTouch?'touch':'keys':S.mode;{
const q=new THREE.Quaternion,e=new THREE.Euler,q1=new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2),q0=new THREE.Quaternion,zee=new THREE.Vector3(0,0,1),v=new THREE.Vector3
;In.onOrient=ev=>{if(ev.beta==null||ev.alpha==null||ev.gamma==null){In.nullCount++;return}In.got=true
;const o=(screen.orientation&&screen.orientation.angle||window.orientation||0)*D2R;e.set(ev.beta*D2R,ev.alpha*D2R,-ev.gamma*D2R,'YXZ');q.setFromEuler(e);q.multiply(q1)
;q.multiply(q0.setFromAxisAngle(zee,-o));v.set(0,0,-1).applyQuaternion(q);const yaw=Math.atan2(-v.x,-v.z)*R2D,pitch=Math.asin(clamp(v.y,-1,1))*R2D
;v.set(1,0,0).applyQuaternion(q);const roll=Math.asin(clamp(v.y,-1,1))*R2D;{const tt=performance.now()/1e3;In.evCount++;In.evT=tt;In.raw=[ev.alpha,ev.beta,ev.gamma]
;In.evTimes.push(tt);while(In.evTimes.length&&tt-In.evTimes[0]>1)In.evTimes.shift();In.rh.push([tt,yaw,pitch,roll]);while(In.rh.length&&tt-In.rh[0][0]>.7)In.rh.shift()}
if(modeNow()==='gyro'){In.yaw=yaw;In.pitch=pitch;In.roll=roll}else{In.gyroRaw=[yaw,pitch,roll]}}}Object.assign(In,{evCount:0,nullCount:0,mCount:0,evT:0,raw:[0,0,0],
evTimes:[],rh:[]});addEventListener('deviceorientation',In.onOrient,true);addEventListener('devicemotion',()=>{In.mCount++},true);In.requestMotion=async()=>{try{
if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){In.perm=await DeviceOrientationEvent.requestPermission()
}else In.perm='granted'}catch(e){In.perm='denied'}};In.recenter=()=>{In.base=In.yaw};In.push=g=>{g.time=performance.now()/1e3;In.lastG=g;In.gq.push(g)}
;In.turnApplied=dir=>{In.base+=90*dir;if(modeNow()!=='gyro')In.simTurnT+=90*dir};In.update=(dt,now,playing,cornerNear)=>{const m=modeNow();if(m!=='gyro'){
let s=(K.KeyD?1:0)-(K.KeyA?1:0);if(m==='keys')s+=clamp(In.mx*1.2,-1,1);if(m==='touch')s+=In.ts;s=clamp(s,-1,1);In.simYaw=damp(In.simYaw,-s*(28/S.steer),12,dt)
;In.simTurn=damp(In.simTurn,In.simTurnT,14,dt);In.yaw=In.simTurn+In.simYaw;In.pitch=damp(In.pitch,-In.my*14,8,dt);In.roll=damp(In.roll,0,8,dt);return}const h=In.hist
;h.push([now,In.yaw,In.pitch,In.roll]);while(h.length&&now-h[0][0]>.7)h.shift();let o=null;for(let i=0;i<h.length;i++)if(now-h[i][0]<=.25){o=h[i];break}
if(!o||now<In.lock)return;const k=S.sens,dy=wrap180(In.yaw-o[1]),dp=(In.pitch-o[2])*(S.invertPitch?-1:1),dr=wrap180(In.roll-o[3])
;const sy=Math.abs(dy)/((cornerNear?18:30)/k),sp=Math.abs(dp)/(11/k),sr=Math.abs(dr)/(14/k),mx=Math.max(sy,sp,sr);if(mx<1)return;let g;if(mx===sy)g={t:'turn',
dir:dy>0?1:-1};else if(mx===sp)g=dp>0?{t:'jump'}:{t:'slide'};else g={t:'dash',dir:dr<0?1:-1};if((g.t==='jump'||g.t==='slide')&&now<In.pLock)return
;if(g.t==='jump'||g.t==='slide')In.pLock=now+.45;In.lock=now+.14;h.length=0;In.push(g)};In.steerCalc=()=>{const rel=wrap180(In.yaw-In.base);In.rel=rel;const SR=28/S.steer
;let x=clamp(-rel/SR,-1,1);const a=Math.abs(x),dz=.09;x=a<dz?0:Math.sign(x)*Math.pow((a-dz)/(1-dz),1.2);In.steer=x};function act(g){if(game.state==='playing')In.push(g)}
addEventListener('keydown',e=>{if(e.repeat)return;K[e.code]=true;const c=e.code;if(game.state==='playing'){if(c==='Space'||c==='ArrowUp'||c==='KeyW')act({t:'jump'
});else if(c==='KeyS'||c==='ArrowDown'||c==='ShiftLeft'||c==='ControlLeft')act({t:'slide'});else if(c==='KeyQ'||c==='ArrowLeft')act({t:'turn',dir:1
});else if(c==='KeyE'||c==='ArrowRight')act({t:'turn',dir:-1});else if(c==='KeyZ')act({t:'dash',dir:-1});else if(c==='KeyC')act({t:'dash',dir:1
});else if(c==='Escape'||c==='KeyP')game.pause()}else if(game.state==='paused'&&(c==='Escape'||c==='KeyP'))game.resume()});addEventListener('keyup',e=>{K[e.code]=false})
;addEventListener('mousemove',e=>{In.mx=(e.clientX/innerWidth-.5)*2;In.my=(e.clientY/innerHeight-.5)*2});{let sx=0,sy=0,st=0,down=false;const cv=$('#gl')
;cv.addEventListener('pointerdown',e=>{down=true;sx=e.clientX;sy=e.clientY;st=performance.now()});cv.addEventListener('pointermove',e=>{
if(down&&modeNow()==='touch')In.ts=clamp((e.clientX-sx)/110,-1,1)});const up=e=>{if(!down)return;down=false;In.ts=0
;const dx=e.clientX-sx,dy=e.clientY-sy,dt=performance.now()-st;if(modeNow()==='touch'&&dt<450&&Math.hypot(dx,dy)>28){if(Math.abs(dx)>Math.abs(dy))act({t:'turn',
dir:dx<0?1:-1});else act({t:dy<0?'jump':'slide'})}};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up)}
addEventListener('contextmenu',e=>e.preventDefault());const canvas=$('#gl');const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,
powerPreference:'high-performance'});renderer.autoClear=false;const isGL2=!!renderer.capabilities.isWebGL2
;const scene=new THREE.Scene,camera=new THREE.PerspectiveCamera(70,1,.1,900);camera.rotation.order='YXZ'
;const vmScene=new THREE.Scene,vmCam=new THREE.PerspectiveCamera(65,1,.02,6);const PAL=[{l:[.97,.96,.93],f:[.925,.915,.89],a:[1,.16,.1]},{l:[1,.96,.91],f:[.965,.865,.78],
a:[1,.3,.1]},{l:[.94,.97,1],f:[.8,.865,.93],a:[.96,.12,.3]},{l:[.95,.98,.94],f:[.84,.9,.82],a:[1,.22,.14]}];const ACTN=['Act I','Act II','Act III','Act IV'];const U={
uTime:{value:0},uCam:{value:new THREE.Vector3},uSun:{value:new THREE.Vector3(.5,.8,.3).normalize()},uLight:{value:new THREE.Color(...PAL[0].l)},uFog:{
value:new THREE.Color(...PAL[0].f)},uAccent:{value:new THREE.Color(...PAL[0].a)},uInk:{value:new THREE.Color(.06,.06,.08)},uFogDen:{value:.008}}
;const VS=`attribute vec2 aSize;attribute vec3 aInfo;varying vec3 vN,vW,vInfo;varying vec2 vUv,vSize;varying float vD; void main(){vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);vUv=uv;vSize=aSize;vInfo=aInfo;vec4 mv=viewMatrix*wp;vD=-mv.z;gl_Position=projectionMatrix*mv;}`
;const FS=`precision highp float;uniform float uTime,uFogDen;uniform vec3 uCam,uSun,uLight,uFog,uAccent,uInk;varying vec3 vN,vW,vInfo;varying vec2 vUv,vSize;varying float vD; float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} void main(){vec3 n=normalize(vN);float kind=vInfo.x,seed=vInfo.y,ex=vInfo.z;bool top=n.y>.5; float sunL=clamp(dot(n,normalize(uSun)),0.,1.);float lit=.40+.40*sunL+.20*(n.y*.5+.5);lit=mix(lit,floor(lit*5.+.5)/5.,.55); vec3 col=uLight*lit; float ed=min(min(vUv.x*vSize.x,(1.-vUv.x)*vSize.x),min(vUv.y*vSize.y,(1.-vUv.y)*vSize.y)); if(!top&&n.y>-.5){float hh=vUv.y*vSize.y;col*=mix(.70,1.,smoothstep(0.,2.2,hh));} col*=mix(.94,1.,smoothstep(0.,.7,ed)); vec3 edgeC=uInk;float edgeW=.03+vD*.0007;float efade=1.-smoothstep(35.,150.,vD);float noEdge=0.; if(kind>.5&&kind<1.5){float p=.88+.12*sin(uTime*3.+seed*6.28);col=uAccent*p*(.78+.22*lit);} else if(kind>1.5&&kind<2.5){if(top){float r=length((vUv-.5)*vSize);float ring=step(0.,sin(r*6.-uTime*7.));col=mix(vec3(.98),uAccent,ring);}else col=uAccent*lit;} else if(kind>2.5&&kind<3.5){col=mix(uLight*.93,uFog,.15)*lit*(.9+.1*seed);if(ex>.5)col=uAccent*(.7+.3*lit);edgeC=mix(uInk,uFog,.55);} else if(kind>3.5&&kind<4.5){col=mix(uAccent,vec3(1.),.25+.25*sin(uTime*4.+seed*9.));noEdge=1.;} else if(kind>5.5&&kind<6.5){if(top){float st=step(.5,fract(ed*.28-uTime*.7));col=mix(uLight,uAccent,st*.9);}} float lw=1.-smoothstep(edgeW,edgeW+fwidth(ed)*1.3+.004,ed);col=mix(col,edgeC,lw*(1.-noEdge)*efade); float f=1.-exp(-pow(vD*uFogDen,1.6));float hf=smoothstep(-4.,-48.,vW.y-uCam.y);f=clamp(f+hf*.6*(1.-f),0.,1.); col=mix(col,uFog,f);col+=(h21(gl_FragCoord.xy+fract(uTime)*91.)-.5)*.018;gl_FragColor=vec4(col,1.);}`
;const mainMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:VS,fragmentShader:FS,extensions:{derivatives:true}});const handMat=new THREE.ShaderMaterial({
uniforms:Object.assign({},U,{uFogDen:{value:0}}),vertexShader:VS,fragmentShader:FS,extensions:{derivatives:true}});const sunMat=new THREE.ShaderMaterial({
transparent:true,depthWrite:false,uniforms:{uA:U.uAccent},
vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'uniform vec3 uA;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float d=smoothstep(.36,.33,r);float h=exp(-r*r*5.);gl_FragColor=vec4(uA,d*.92+h*.16);}'
});const sun=new THREE.Mesh(new THREE.PlaneGeometry(1,1),sunMat);sun.scale.set(150,150,1);scene.add(sun);sun.frustumCulled=false
;const SUNDIR=new THREE.Vector3(-.35,.2,-.9).normalize();const postMat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tS:{value:null},uRes:{
value:new THREE.Vector2(1,1)},uTime:{value:0},uBlur:{value:0},uChroma:{value:0},uVig:{value:.35},uSlow:{value:0},uFlash:{value:0},uRed:{value:0},uShat:{value:0}},
vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
fragmentShader:`precision highp float;uniform sampler2D tS;uniform vec2 uRes;uniform float uTime,uBlur,uChroma,uVig,uSlow,uFlash,uRed,uShat;varying vec2 vUv; float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} vec2 h22(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);} void main(){vec2 uv=vUv;float asp=uRes.x/uRes.y;float crack=0.; if(uShat>.001){vec2 p=vec2(uv.x*asp,uv.y)*4.2;vec2 ip=floor(p),fp=fract(p);float d1=9.,d2=9.;vec2 id=vec2(0.);  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=h22(ip+g);vec2 pt=g+.5+.42*sin(6.2831*o+3.);float d=length(pt-fp);if(d<d1){d2=d1;d1=d;id=ip+g;}else if(d<d2){d2=d;}}  vec2 hd=h22(id)-.5;float s=uShat*uShat;uv+=vec2(hd.x/asp,hd.y)*s*.5+vec2(0.,-s*.35*h21(id));crack=1.-smoothstep(0.,.06,d2-d1);} vec2 d=uv-.5;float r=length(d);float bl=uBlur*smoothstep(.1,.8,r);float ca=uChroma*r*.012;vec3 c=vec3(0.); for(int i=0;i<4;i++){float t=float(i)/3.;vec2 u=uv-d*bl*t;c+=vec3(texture2D(tS,u-d*ca).r,texture2D(tS,u).g,texture2D(tS,u+d*ca).b);} c/=4.; c*=1.-uVig*smoothstep(.3,.95,r*1.2); float l=dot(c,vec3(.3,.59,.11));c=mix(c,vec3(l),uSlow*.4);c=mix(c,c*c*(3.-2.*c),.22); c=mix(c,vec3(1.,.1,.07),uRed*smoothstep(.25,.9,r)*.55); c=mix(c,vec3(.06),crack*clamp(uShat*6.,0.,1.));c=mix(c,vec3(1.),smoothstep(.75,1.,uShat)); c=mix(c,vec3(1.),uFlash);c+=(h21(gl_FragCoord.xy+fract(uTime)*57.)-.5)*.02;gl_FragColor=vec4(c,1.);}`
});const postScene=new THREE.Scene,postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);{const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMat);m.frustumCulled=false
;postScene.add(m)}let rt=null;const QS={low:{s:.6,ms:0},med:{s:.8,ms:2},high:{s:1,ms:4}};function makeRT(w,h){const ms=isGL2?QS[S.quality].ms:0;let r;if(ms){
r=new THREE.WebGLMultisampleRenderTarget(w,h,{format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});r.samples=ms
}else r=new THREE.WebGLRenderTarget(w,h,{format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});return r}let aspect=1;function resize(){
const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2);renderer.setPixelRatio(dpr);renderer.setSize(w,h);if(rt)rt.dispose()
;rt=makeRT(Math.max(2,Math.floor(w*dpr*QS[S.quality].s)),Math.max(2,Math.floor(h*dpr*QS[S.quality].s)));aspect=w/h;camera.aspect=aspect;vmCam.aspect=aspect
;postMat.uniforms.uRes.value.set(canvas.width,canvas.height);fitHands()}addEventListener('resize',resize)
;const baseVFov=()=>clamp(2*Math.atan(Math.tan(S.fov*D2R/2)/aspect)*R2D,52,102);const NS=26,sgeo=new THREE.BufferGeometry,spos=new Float32Array(NS*6)
;sgeo.setAttribute('position',new THREE.BufferAttribute(spos,3));const smat=new THREE.LineBasicMaterial({color:1381656,transparent:true,opacity:0,depthWrite:false
}),streak=new THREE.LineSegments(sgeo,smat);streak.frustumCulled=false;scene.add(streak);const sd=[];for(let i=0;i<NS;i++)sd.push({a:Math.random()*6.28,
rad:2.6+Math.random()*9,f:Math.random()*70-8,len:.5+Math.random()*1.6});function mkBox(w,h,d,kind,seed){
const g=new THREE.BoxGeometry(w,h,d),sz=new Float32Array(48),inf=new Float32Array(72),fs=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];for(let f=0;f<6;f++)for(let v=0;v<4;v++){
const i=f*4+v;sz[i*2]=fs[f][0];sz[i*2+1]=fs[f][1];inf[i*3]=kind;inf[i*3+1]=seed}g.setAttribute('aSize',new THREE.BufferAttribute(sz,2))
;g.setAttribute('aInfo',new THREE.BufferAttribute(inf,3));return new THREE.Mesh(g,handMat)}const hands=[];function mkHand(side){const g=new THREE.Group
;const add=(m,x,y,z)=>{m.position.set(x,y,z);g.add(m)};add(mkBox(.09,.085,.5,0,.2),0,0,.25);add(mkBox(.1,.095,.05,1,.5),0,0,.02);add(mkBox(.105,.05,.1,1,.3),0,0,-.06)
;for(let i=0;i<4;i++){add(mkBox(.022,.03,.075,1,.1*i),(i-1.5)*.026,-.004,-.145);add(mkBox(.022,.04,.028,1,.7),(i-1.5)*.026,-.027,-.18)}const th=mkBox(.026,.03,.065,1,.4)
;add(th,-side*.065,-.005,-.07);th.rotation.y=side*.5;vmScene.add(g);return{g:g,side:side,x:0}}hands.push(mkHand(-1),mkHand(1));let handScale=1;function fitHands(){
const v=65*D2R;vmCam.fov=65;vmCam.updateProjectionMatrix();const halfW=Math.tan(v/2)*aspect*.55;handScale=clamp(aspect*1.7,.6,1);for(const h of hands){
h.x=h.side*Math.min(.2,halfW*.62);h.g.scale.setScalar(handScale)}}const hs={jump:0,slide:0,dash:0,turn:0,run:0};const FACES=b=>{
const{x0:x0,x1:x1,y0:y0,y1:y1,z0:z0,z1:z1}=b,sx=x1-x0,sy=y1-y0,sz=z1-z0
;return[[[0,1,0],[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],sx,sz],[[0,-1,0],[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],sx,sz],[[1,0,0],[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],sz,sy],[[-1,0,0],[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],sz,sy],[[0,0,1],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],sx,sy],[[0,0,-1],[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],sx,sy]]
};const UVS=[[0,0],[1,0],[1,1],[0,1]];function buildMesh(ch){const all=[];for(const b of ch.boxes)all.push(b);for(const b of ch.vboxes)all.push(b)
;for(const b of ch.decor)all.push(b)
;const N=all.length,pos=new Float32Array(N*72),nor=new Float32Array(N*72),uv=new Float32Array(N*48),sz=new Float32Array(N*48),inf=new Float32Array(N*72),idx=new Uint16Array(N*36)
;let vi=0,ii=0;for(const b of all){const seed=Math.abs(Math.sin(b.x0*12.9898+b.z0*78.233+b.y0*37.7))%1;for(const f of FACES(b)){const base=vi;for(let k=0;k<4;k++){
const p=f[1][k];pos.set(p,vi*3);nor.set(f[0],vi*3);uv.set(UVS[k],vi*2);sz[vi*2]=f[2];sz[vi*2+1]=f[3];inf[vi*3]=b.k;inf[vi*3+1]=seed;inf[vi*3+2]=b.s||0;vi++}
idx.set([base,base+1,base+2,base,base+2,base+3],ii);ii+=6}}const g=new THREE.BufferGeometry;g.setAttribute('position',new THREE.BufferAttribute(pos,3))
;g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('aSize',new THREE.BufferAttribute(sz,2))
;g.setAttribute('aInfo',new THREE.BufferAttribute(inf,3));g.setIndex(new THREE.BufferAttribute(idx,1));const m=new THREE.Mesh(g,mainMat);m.frustumCulled=false
;scene.add(m);ch.mesh=m}function dropMesh(ch){if(ch.mesh){scene.remove(ch.mesh);ch.mesh.geometry.dispose();ch.mesh=null}}const el={hud:$('#hud'),dn:$('#hdn'),
ff:$('#hff'),hs:$('#hhs'),bs:$('#hbs'),fxf:$('#fxf'),fxr:$('#fxr')};let hintTO=0;function bigText(t){el.bs.textContent=t;el.bs.classList.remove('on')
;void el.bs.offsetWidth;el.bs.classList.add('on')}function hintText(t){clearTimeout(hintTO);if(!t){el.hs.classList.remove('on');return}
if(el.hs.textContent!==t||!el.hs.classList.contains('on')){el.hs.textContent=t;el.hs.classList.remove('on');void el.hs.offsetWidth;el.hs.classList.add('on')}}
function buzz(p){if(S.haptics&&navigator.vibrate)try{navigator.vibrate(p)}catch(e){}}const SCRS=['loader','menu','settings','how','calib','pause'];function show(id){
for(const s of SCRS){const e=$('#'+s);if(e)e.classList.toggle('on',s===id)}}function wipe(fn){const w=$('#wipe');w.className='in';setTimeout(()=>{fn();w.className='out'
;setTimeout(()=>w.className='',520)},430)}const game={state:'loading',course:null,P:null,cp:null,ts:1,slowUntil:0,slowK:1,flow:0,combo:0,flowIdle:0,shake:0,dip:0,
eye:1.62,deadT:0,flash:0,red:0,visH:0,act:0,lockT:0,lastStepN:0,stepAlt:false,mileN:0,hintShown:{},cpRef:null,attract:null,slideSnd:false,pause(){
if(this.state!=='playing')return;this.state='paused';show('pause');A.setTS(this.ts,true);A.slideStop()},resume(){if(this.state!=='paused')return;In.gq.length=0;show(null)
;this.state='playing';In.recenter();A.setTS(1,false)}};function newCourse(seed){if(game.course)for(const ch of game.course.chunks)dropMesh(ch)
;const c=new CORE.Course(seed);c.onDrop=dropMesh;game.course=c;for(let i=0;i<10;i++)c.next();for(const ch of c.chunks)buildMesh(ch);game.cp=c.chunks[0].cp
;game.cpRef=game.cp}function ensure(){const c=game.course;let n=0;while(c.n-game.P.ci<10&&n++<3){const ch=c.next();buildMesh(ch)}}function newRun(){
newCourse(Math.random()*2**31|0);game.P=CORE.newPlayer(game.cp);game.flow=0;game.combo=0;game.mileN=0;game.hintShown={};game.act=0;game.visH=0;game.ts=1;In.recenter()
;In.simTurn=In.simTurnT=0;In.gq.length=0;In.hist.length=0}function slowmo(d,k){game.slowUntil=performance.now()/1e3+d;game.slowK=k}function setAct(a){game.act=a}
function handleEvents(P){for(const e of P.ev){if(e.t==='land'){A.land(e.v);game.dip=clamp(e.v/40,.03,.3);hs.jump=0;if(e.v>12)buzz(12)
;if(e.v>6)game.flow=clamp(game.flow+.01,0,1)}else if(e.t==='jump'){A.jump();hs.jump=1}else if(e.t==='slide'){A.slideStart();game.slideSnd=true;hs.slide=1
}else if(e.t==='dive'){A.jump()}else if(e.t==='dash'){A.dash();hs.dash=e.dir;buzz(8)}else if(e.t==='pad'){A.pad();game.dip=-.1;hs.jump=1;buzz(20)}else if(e.t==='turn'){
A.turn();slowmo(.34,.38);game.red=1;hs.turn=e.dir;In.turnApplied(e.dir);game.flow=clamp(game.flow+(e.perfect?.12:.07),0,1);game.flowIdle=0;buzz(e.perfect?[14,20,14]:14)
;hintText('')}else if(e.t==='turnmiss'||e.t==='turnwrong'){A.tick()}else if(e.t==='impact'){A.impact();game.shake=1;game.flow=0;game.combo=0;buzz(40)
}else if(e.t==='gate'){if(e.ok){game.combo++;A.gate(game.combo-1);game.flow=clamp(game.flow+.07+Math.min(.05,game.combo*.004),0,1);game.flowIdle=0
;if(e.vis&&!e.need)slowmo(.12,.7);buzz(6)}else{game.combo=0;A.miss();game.flow=Math.max(0,game.flow-.05)}}else if(e.t==='die')die(e.why)}}function die(why){
game.state='dead';game.deadT=0;A.death();A.slideStop();buzz([30,40,60]);bigText('Broken.');hintText('');const d=Math.floor(game.P.dist);if(d>best){best=d;try{
localStorage.setItem('fs_best',best)}catch(e){}}}function doRespawn(){const P=game.P;CORE.respawn(game.course,P,game.cpRef);game.flow=Math.max(0,game.flow*.3)
;game.combo=0;game.ts=1;In.recenter();In.simTurn=In.simTurnT=0;In.gq.length=0;In.hist.length=0;game.lockT=.7;game.visH=P.H*90;game.state='playing';game.flash=1;A.rise()
;bigText('Again.');ensure()}function updateHints(P){const c=game.course;let best=null;for(let i=P.ci;i<=P.ci+1;i++){const ch=c.get(i);if(!ch||!ch.hint)continue
;const h=ch.hint,p=(P.x-h.x)*h.ax+(P.z-h.z)*h.az;if(p>-36&&p<2){best={ch:ch,h:h};break}}if(!best){hintText('');return}const t=best.h.type
;if((hintCnt[t]||0)>=4&&!game.hintShown[best.ch.i]){hintText('');return}if(!game.hintShown[best.ch.i]){game.hintShown[best.ch.i]=true;hintCnt[t]=(hintCnt[t]||0)+1;try{
localStorage.setItem('fs_hints',JSON.stringify(hintCnt))}catch(e){}}const m=modeNow(),k=m==='keys';const TX={jump:k?'Space: leap':'Flick up: leap',
slide:k?'S: slide':'Flick down: slide',dash:k?'Z / C: dash':'Tilt: dash',steer:k?'A / D: steer':'Rotate slowly: steer',
turn:best.h.dir>0?k?'Q: turn left':'Snap left':k?'E: turn right':'Snap right'};hintText(TX[t])}function stepGame(raw,now){const P=game.P,c=game.course
;const tgt=now<game.slowUntil?game.slowK:1;game.ts=damp(game.ts,tgt,tgt<game.ts?28:5,raw);const dt=raw*game.ts;const cn=(()=>{const i=P.ci;for(let k=i-1;k<=i+1;k++){
const ch=c.get(k);if(ch&&ch.corner&&!ch.corner.used)return true}return false})();In.update(raw,now,true,cn);In.steerCalc();if(game.lockT>0){game.lockT-=raw;In.gq.length=0
}for(const g of In.gq)P.q.push(g);In.gq.length=0;P.steer=In.steer;const spd=15+8.5*clamp(P.dist/2800,0,1);P.speedT=Math.max(spd+game.flow*3.4,spd);CORE.stepP(c,P,dt)
;handleEvents(P);if(game.state!=='playing')return;if(game.slideSnd&&!P.sliding){A.slideStop();game.slideSnd=false}const ch=c.get(P.ci);if(ch){if(ch.act!==game.act){
setAct(ch.act);bigText(ACTN[ch.act])}if(ch.cp&&ch.cp!==game.cpRef&&(P.x-ch.cp.x)*CORE.hv(P.H)[0]+(P.z-ch.cp.z)*CORE.hv(P.H)[1]>0){game.cpRef=ch.cp;ch.cp.dist=P.dist
;A.cp();bigText('Checkpoint')}}ensure();c.trim(Math.min(P.ci,game.cpRef.ci)-2);if(P.grounded&&!P.sliding){P.stride+=P.speed*dt/5.4;const n=Math.floor(P.stride*2)
;if(n!==game.lastStepN){game.lastStepN=n;game.stepAlt=!game.stepAlt;A.step(clamp(P.speed/22,.3,1),game.stepAlt)}}game.flowIdle+=dt
;game.flow=clamp(game.flow-(game.flowIdle>4?.04:.01)*dt,0,1);const mn=Math.floor(P.dist/300);if(mn>game.mileN){game.mileN=mn
;bigText(['Keep. Moving.','Flow. Flow. Flow.','Breathe.','No. Thoughts.','Just. Rotate.'][mn%5])}updateHints(P)
;el.dn.textContent=String(Math.floor(P.dist)).padStart(3,'0');el.ff.style.width=game.flow*100+'%';A.wind(clamp((P.speed-6)/20,0,1),!P.grounded)
;A.intensity(.1+game.flow*.85+clamp((P.speed-14)/14,0,1)*.15);A.setTS(game.ts,false)}const sdv=new THREE.Vector3;function updateCamera(raw,now){const P=game.P
;let px,py,pz,yaw,pitch,roll,fovK=0;const att=game.state==='menu'||game.state==='settings'||game.state==='how'||game.state==='loading';if(att&&game.attract){
const a=game.attract;a.s+=raw*9;if(a.s>=a.len-30){a.s=0;game.flash=.9}const p0=a.at(a.s),p1=a.at(a.s+16);a.cx=damp(a.cx,p0[0],5,raw);a.cy=damp(a.cy,p0[1],5,raw)
;a.cz=damp(a.cz,p0[2],5,raw);if(a.s<.1){a.cx=p0[0];a.cy=p0[1];a.cz=p0[2];a.lx=p1[0];a.lz=p1[2]}a.lx=damp(a.lx,p1[0],3,raw);a.lz=damp(a.lz,p1[2],3,raw);px=a.cx;pz=a.cz
;py=a.cy+2.6+Math.sin(now*.5)*.25;yaw=Math.atan2(-(a.lx-px),-(a.lz-pz))*R2D;pitch=-8;roll=Math.sin(now*.4)*1.5;fovK=0}else{const rel=wrap180(In.yaw-In.base)
;game.visH=damp(game.visH,P.H*90,10,raw);const sn=clamp(P.speed/24,0,1),slide=P.sliding?1:0;game.eye=damp(game.eye,slide?.68:1.62,14,raw);game.dip=damp(game.dip,0,9,raw)
;game.shake=damp(game.shake,0,5,raw);const bobA=P.grounded&&!slide?S.bob:0,ph=P.stride*Math.PI*2;const bob=Math.sin(ph)*.045*bobA*sn
;const sk=S.shake*(.004+.007*sn)+game.shake*.07*S.shake,sh=[Math.sin(now*37)*sk,Math.sin(now*29+1)*sk,Math.sin(now*23+2)*sk];px=P.x+sh[0]
;py=P.y+game.eye+bob-game.dip+sh[1];pz=P.z+sh[2];yaw=P.H*90+(P.alive?rel:rel);pitch=clamp(In.pitch,-72,78)+Math.cos(ph)*.35*bobA*sn
;roll=In.roll*S.roll*.35-(P.lat+P.dashV)*.35*S.roll+Math.sin(ph)*.45*bobA*sn;fovK=sn*6+slide*4+game.flow*4+(P.grounded?0:2)}camera.position.set(px,py,pz)
;camera.rotation.set(pitch*D2R,yaw*D2R,roll*D2R,'YXZ');camera.fov=baseVFov()+fovK;camera.updateProjectionMatrix();U.uCam.value.set(px,py,pz)
;sun.position.set(px+SUNDIR.x*700,py+SUNDIR.y*700+40,pz+SUNDIR.z*700);sun.lookAt(camera.position);const sn2=att?.3:clamp((P.speed-10)/16,0,1)
;smat.opacity=clamp(sn2-.25,0,1)*.2;const vh=(att?yaw:game.visH)*D2R,hx=-Math.sin(vh),hz=-Math.cos(vh),rx=-hz,rz=hx,sp=att?9:P.speed;for(let i=0;i<NS;i++){const s=sd[i]
;s.f-=sp*raw;if(s.f<-8){s.f+=75+Math.random()*10;s.a=Math.random()*6.28;s.rad=2.6+Math.random()*9}
const lx=Math.cos(s.a)*s.rad,ly=Math.sin(s.a)*s.rad*.7+1.2,bx=px+hx*s.f+rx*lx,bz=pz+hz*s.f+rz*lx,by=py-1.2+ly,L=s.len*(.5+sn2*2);spos[i*6]=bx;spos[i*6+1]=by
;spos[i*6+2]=bz;spos[i*6+3]=bx+hx*L;spos[i*6+4]=by;spos[i*6+5]=bz+hz*L}sgeo.attributes.position.needsUpdate=true}function updateHands(raw,now){
const P=game.P,sn=clamp(P.speed/24,0,1),ph=P.stride*Math.PI*2,gr=P.grounded&&!P.sliding?1:0;hs.jump=damp(hs.jump,P.grounded?0:1,10,raw)
;hs.slide=damp(hs.slide,P.sliding?1:0,12,raw);hs.dash=damp(hs.dash,0,6,raw);hs.turn=damp(hs.turn,0,7,raw);hs.run=damp(hs.run,gr*sn,6,raw);for(const h of hands){
const s=h.side,p=s<0?0:Math.PI,sw=Math.sin(ph+p)*hs.run,cw=Math.cos(ph+p)*hs.run
;h.g.position.set(h.x*(1+hs.slide*.3)+hs.turn*.05*-1*s*0,-.31+Math.abs(Math.sin(ph*1))*.012*hs.run-hs.slide*.05+hs.jump*.07-.01+(s*hs.dash>0?0:0),-.55+cw*.06-hs.slide*.04-hs.jump*.03)
;h.g.rotation.set(.25+sw*.32*S.bob+hs.jump*.35-hs.slide*.25,s*.16+hs.turn*.35+(s*hs.dash>0?-s*.25:0),s*.06-hs.dash*.2+sw*.05*s)
;h.g.scale.setScalar(handScale*(1+(s*hs.dash>0?.04:0)))}}function render(now){U.uTime.value=now;const dpal=PAL[game.act],k=.8/60*60;const dc=(col,arr,r)=>{
col.r=damp(col.r,arr[0],r,.016);col.g=damp(col.g,arr[1],r,.016);col.b=damp(col.b,arr[2],r,.016)};dc(U.uLight.value,dpal.l,1.2);dc(U.uFog.value,dpal.f,1.2)
;dc(U.uAccent.value,dpal.a,1.2);renderer.setClearColor(U.uFog.value,1);const playing=game.state==='playing'||game.state==='dead'||game.state==='paused'
;renderer.setRenderTarget(rt);renderer.clear(true,true,true);renderer.render(scene,camera);if(S.hands&&playing){renderer.clearDepth();renderer.render(vmScene,vmCam)}
renderer.setRenderTarget(null);const P=game.P,sn=P?clamp((P.speed-10)/16,0,1):.3,u=postMat.uniforms;u.tS.value=rt.texture;u.uTime.value=now
;u.uBlur.value=(playing?sn:.2)*.03+game.flow*.008;u.uChroma.value=.25+sn*.4+game.flow*.4;u.uVig.value=.32+sn*.12;u.uSlow.value=clamp(1-game.ts,0,1)
;u.uFlash.value=game.flash;u.uRed.value=game.red;u.uShat.value=game.state==='dead'?clamp(game.deadT/1,0,1):0;renderer.render(postScene,postCam);el.fxf.style.opacity=0}
let lastT=performance.now()/1e3;function frame(){requestAnimationFrame(frame);const now=performance.now()/1e3;let raw=Math.min(.05,now-lastT);lastT=now
;game.flash=damp(game.flash,0,5,raw);game.red=damp(game.red,0,6,raw);const st=game.state;if(st==='playing'){stepGame(raw,now)}else if(st==='dead'){game.deadT+=raw
;if(game.deadT>1.15)doRespawn()}else if(st==='paused'){In.update(raw,now,false,false);In.steerCalc();labUpdate()}else{In.update(raw,now,false,false);In.steerCalc()
;if(st==='settings')labUpdate()}if(game.course&&game.P&&(st==='playing'||st==='dead'||st==='paused')){updateCamera(raw,now)
;if(st==='playing'||st==='dead')updateHands(st==='dead'?0:raw,now)}else if(game.course)updateCamera(raw,now);if(rt)render(now);el.fxr.style.opacity=game.red*.8}
function buildAttract(){const c=game.course,pts=[];for(const ch of c.chunks)for(const w of ch.wps){const l=pts[pts.length-1]
;if(!l||Math.hypot(l[0]-w[0],l[2]-w[2])>.5)pts.push(w)}const cum=[0]
;for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1],pts[i][2]-pts[i-1][2]));const len=cum[cum.length-1];const at=s=>{
s=clamp(s,0,len-.01);let i=1;while(i<cum.length-1&&cum[i]<s)i++;const t=(s-cum[i-1])/Math.max(.001,cum[i]-cum[i-1])
;return[lerp(pts[i-1][0],pts[i][0],t),lerp(pts[i-1][1],pts[i][1],t),lerp(pts[i-1][2],pts[i][2],t)]};const p0=at(0),p1=at(16);game.attract={s:0,len:len,at:at,cx:p0[0],
cy:p0[1],cz:p0[2],lx:p1[0],lz:p1[2]}}
const TIPS=['Rotate. Do not tap.','Your wrist is the controller.','Look where you are going. Literally.','Red kills. White holds.','Snap early. Corners buffer.','Breathe out on the landing.','Rings in order play a melody.']
;function setProg(p,label){game.progT=p;if(label)$('#ld-step').textContent=label}let progV=0;(function progLoop(){progV+=((game.progT||0)-progV)*.12
;const p=Math.round(progV*100);$('#ld-pct').textContent=p;$('#ld-fill').style.width=progV*100+'%';if(game.state==='loading')requestAnimationFrame(progLoop)})()
;function letters(id,txt,off){const e=$(id);[...txt].forEach((ch,i)=>{const s=document.createElement('span');s.textContent=ch;s.style.setProperty('--i',i+off)
;if(ch==='.')s.className='dot';e.appendChild(s)})}letters('#t1','FLOW',0);letters('#t2','STATE.',4);$('#ld-tip').textContent=TIPS[Math.floor(Math.random()*TIPS.length)]
;const tick=ms=>new Promise(r=>setTimeout(r,ms));async function boot(){const t0=performance.now();setProg(.08,'Waking the renderer');resize();await tick(120)
;setProg(.3,'Growing the course');newCourse(Math.random()*2**31|0);game.P=CORE.newPlayer(game.cp);await tick(120);setProg(.6,'Compiling shaders');buildAttract();try{
updateCamera(.016,0);render(0)}catch(e){console.error(e)}await tick(120);setProg(.85,'Tuning the silence');try{await Promise.race([document.fonts.ready,tick(1500)])
}catch(e){}const wait=2600-(performance.now()-t0);if(wait>0)await tick(wait);setProg(1,'Ready');await tick(400);const b=$('#ld-go');b.textContent='Tap to enter'
;b.classList.add('rdy');b.disabled=false;b.onclick=async()=>{b.onclick=null;In.requestMotion();A.init();A.ui();await tick(60);toMenu(true)}}function toMenu(wiped){
const go=()=>{game.state='menu';show('menu');hud(false);if(game.course)buildAttract();$('#mn-best').textContent='Best '+best+' m';updMode();A.intensity(.2)
;A.setTS(1,false);A.slideStop()};if(wiped)wipe(go);else go()}function updMode(){const m=modeNow()
;$('#mn-mode').textContent=m==='gyro'?'Input: gyro':isTouch?'No motion sensor: swipe mode. Open in its own tab for gyro':'Input: '+(m==='keys'?'keyboard':m)}
function hud(on){el.hud.classList.toggle('on',on)}async function startFlow(){A.init();if(In.perm!=='granted')await In.requestMotion();await tick(250);wipe(()=>{newRun()
;game.state='calib';A.intensity(.15);if(modeNow()==='gyro'){show('calib')}else beginRun()})}function beginRun(){show(null);hud(true);In.recenter();game.state='playing'
;game.lockT=.2;game.P.speed=0;bigText('Go.');A.setTS(1,false)}$('#cal-go').onclick=()=>{A.ui();beginRun()};$('#hp').onclick=()=>{A.ui();game.pause()};let prev='menu'
;document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;A.init();A.ui();if(a==='play')startFlow();else if(a==='how'){
prev='menu';game.state='how';show('how')}else if(a==='settings'){prev=game.state==='paused'?'pause':'menu';if(game.state!=='paused')game.state='settings';show('settings')
;buildSettings()}else if(a==='back'){if(prev==='pause'){show('pause')}else toMenu(false)}else if(a==='resume')game.resume();else if(a==='restart'){wipe(()=>{hud(true)
;newRun();beginRun()})}else if(a==='menu')wipe(()=>{toMenu(false)})});document.addEventListener('visibilitychange',()=>{if(document.hidden)game.pause()})
;addEventListener('blur',()=>game.pause());const CFG=[{sec:'Motion'},{k:'sens',l:'Snap sensitivity',h:'Higher means a smaller flick triggers a move',min:.4,max:2.5,
st:.05,f:v=>v.toFixed(2)+'x'},{k:'steer',l:'Steer gain',h:'Higher means less rotation to steer',min:.5,max:2.5,st:.05,f:v=>v.toFixed(2)+'x'},{k:'invertPitch',
l:'Invert up/down flick',t:'tg'},{k:'mode',l:'Input',t:'seg',o:[['auto','Auto'],['gyro','Gyro'],['touch','Touch'],['keys','Keys']]},{sensor:1},{lab:1},{sec:'View'},{
k:'fov',l:'Field of view',min:60,max:110,st:1,f:v=>v+'°'},{k:'roll',l:'Camera roll',min:0,max:1,st:.05,f:v=>Math.round(v*100)+'%'},{k:'bob',l:'Head bob',min:0,max:1,
st:.05,f:v=>Math.round(v*100)+'%'},{k:'shake',l:'Camera shake',min:0,max:1,st:.05,f:v=>Math.round(v*100)+'%'},{k:'hands',l:'Show hands',t:'tg'},{k:'quality',l:'Quality',
t:'seg',o:[['low','Low'],['med','Med'],['high','High']]},{sec:'Audio'},{k:'music',l:'Music',min:0,max:1,st:.05,f:v=>Math.round(v*100)+'%'},{k:'sfx',l:'Effects',min:0,
max:1,st:.05,f:v=>Math.round(v*100)+'%'},{k:'haptics',l:'Vibration',t:'tg'},{sec:'Other'},{reset:1}];let labEls=null;function buildSettings(){const root=$('#set-body')
;root.innerHTML='';for(const c of CFG){if(c.sec){const d=document.createElement('div');d.className='sec';d.textContent=c.sec;root.appendChild(d);continue}if(c.sensor){
const d=document.createElement('div')
;const bar=(id,n)=>`<div class=mt><div class='mono mh'><span>${n}</span><span id=${id}v>0%</span></div><div class=mb><i id=${id}></i><i class=tk></i></div></div>`
;d.innerHTML=`<div class='lab lab2'><div class=m><span class=mono>Sensor</span><b id=sc-st>-</b></div><div class=m><span class=mono>Rate</span><b id=sc-hz>0 Hz</b></div><div class=m><span class=mono>Alpha / Beta / Gamma</span><b id=sc-raw class=sm>-</b></div><div class=m><span class=mono>Context</span><b id=sc-ctx class=sm>-</b></div></div><p class='mono note' id=sc-msg></p><div class='mono mt2'>Flick meter. Cross the red line to trigger.</div>`+bar('sm-t','Turn (snap sideways)')+bar('sm-l','Leap / Slide (flick up or down)')+bar('sm-d','Dash (tilt sideways)')+`<div class=btns><button class=btn id=sc-en>Enable motion</button><button class='btn alt' id=sc-re>Recheck</button></div>`
;root.appendChild(d);$('#sc-en').onclick=async()=>{await In.requestMotion();addEventListener('deviceorientation',In.onOrient,true);updMode()};$('#sc-re').onclick=()=>{
In.evCount=0;In.nullCount=0;In.mCount=0;A.ui()};continue}if(c.lab){const d=document.createElement('div')
;d.innerHTML=`<div class=lab><div class=m><span class=mono>Yaw</span><b id=lb-y>0</b></div><div class=m><span class=mono>Pitch</span><b id=lb-p>0</b></div><div class=m><span class=mono>Roll</span><b id=lb-r>0</b></div><div class=lamps><span data-g=turn1>Turn L</span><span data-g=turn-1>Turn R</span><span data-g=jump>Leap</span><span data-g=slide>Slide</span><span data-g=dash1>Dash R</span><span data-g=dash-1>Dash L</span></div></div><div class=btns><button class=btn id=lb-re>Recentre</button><button class='btn alt' id=lb-perm>Enable motion</button></div><p class='mono note'>Gesture lab: make each move and watch the lamp. Tune sensitivity until it fires every time and never by accident.</p>`
;root.appendChild(d);$('#lb-re').onclick=()=>{In.recenter();A.ui()};$('#lb-perm').onclick=async()=>{await In.requestMotion();updMode()};labEls={y:$('#lb-y'),p:$('#lb-p'),
r:$('#lb-r'),lamps:$$('.lamps span')};continue}if(c.reset){const b=document.createElement('button');b.className='btn alt';b.textContent='Reset to defaults'
;b.onclick=()=>{Object.assign(S,DEF);saveS();buildSettings();resize();A.setVol()};root.appendChild(b);continue}const row=document.createElement('div');row.className='row'
;const lab=document.createElement('label');lab.innerHTML=c.l+(c.h?'<small>'+c.h+'</small>':'');row.appendChild(lab);if(c.t==='tg'){
const b=document.createElement('button');b.className='tg'+(S[c.k]?' on':'');b.setAttribute('role','switch');b.setAttribute('aria-checked',!!S[c.k]);b.onclick=()=>{
S[c.k]=!S[c.k];b.classList.toggle('on',S[c.k]);b.setAttribute('aria-checked',S[c.k]);saveS();A.ui()};row.appendChild(b)}else if(c.t==='seg'){
const d=document.createElement('div');d.className='seg';for(const o of c.o){const b=document.createElement('button');b.textContent=o[1];b.className=S[c.k]===o[0]?'on':''
;b.onclick=()=>{S[c.k]=o[0];[...d.children].forEach(x=>x.classList.toggle('on',x===b));saveS();A.ui();if(c.k==='quality')resize();updMode()};d.appendChild(b)}
row.appendChild(d)}else{const d=document.createElement('div');d.className='rg';const i=document.createElement('input');i.type='range';i.min=c.min;i.max=c.max;i.step=c.st
;i.value=S[c.k];const o=document.createElement('output');o.textContent=c.f(+S[c.k]);i.oninput=()=>{S[c.k]=+i.value;o.textContent=c.f(+i.value);saveS()
;if(c.k==='music'||c.k==='sfx')A.setVol()};i.setAttribute('aria-label',c.l);d.appendChild(i);d.appendChild(o);row.appendChild(d)}root.appendChild(row)}}
function sensorUpdate(){if(!$('#sc-st'))return;const now=performance.now()/1e3,live=In.evCount>0&&now-In.evT<1;const framed=(()=>{try{return window!==window.top}catch(e){
return true}})();let st=live?'LIVE':In.evCount>0?'STALLED':In.perm==='denied'?'BLOCKED':'NO DATA';$('#sc-st').textContent=st
;$('#sc-st').style.color=live?'#0a8a3a':'#ff2a1d';const t=In.evTimes;$('#sc-hz').textContent=(live?t.length:0)+' Hz'
;$('#sc-raw').textContent=In.evCount?In.raw.map(v=>Math.round(v)).join(' / '):'-'
;$('#sc-ctx').textContent=(framed?'EMBEDDED':'OWN TAB')+' / '+(window.isSecureContext?'HTTPS':'INSECURE');let m
;if(live)m='Sensor live. Make each move and watch the meter cross the red line. If a bar never gets there, raise Snap sensitivity.';else if(In.perm==='denied')m='Motion permission was denied. On iPhone, quit the browser, reopen, and tap Allow. Or enable Motion and Orientation access for this site in Safari settings.';else if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'&&In.perm!=='granted')m='Tap Enable motion and allow the prompt.';else if(framed)m='No motion data. This page is embedded, and browsers block the gyro inside embedded pages. Open the link in its own browser tab.';else if(In.nullCount>0)m='The browser sends empty sensor data. Motion sensors are off for this site or device. Check site settings for Motion sensors, and turn off battery saver.';else m='No motion events yet. Move the phone. If nothing appears, check site settings for Motion sensors.'
;$('#sc-msg').textContent=m;const h=In.rh;let o=null;for(let i=0;i<h.length;i++)if(now-h[i][0]<=.25){o=h[i];break}const k=S.sens;let sy=0,sp=0,sr=0;if(o&&live){
sy=Math.abs(wrap180(In.rh[In.rh.length-1][1]-o[1]))/(30/k);sp=Math.abs(In.rh[In.rh.length-1][2]-o[2])/(11/k);sr=Math.abs(wrap180(In.rh[In.rh.length-1][3]-o[3]))/(14/k)}
const set=(id,v)=>{const e=$('#'+id);if(!e)return;const pk=Math.max(+(e.dataset.pk||0)*.985,v);e.dataset.pk=pk;e.style.width=Math.min(100,v/1.5*100)+'%'
;e.style.background=v>=1?'#ff2a1d':'#0c0c0f';$('#'+id+'v').textContent=Math.round(v*100)+'%  peak '+Math.round(pk*100)+'%'};set('sm-t',sy);set('sm-l',sp);set('sm-d',sr)}
function labUpdate(){sensorUpdate();if(!labEls||!$('#lb-y'))return;const m=modeNow();labEls.y.textContent=Math.round(wrap180(In.yaw-In.base))+'°'
;labEls.p.textContent=Math.round(In.pitch)+'°';labEls.r.textContent=Math.round(In.roll)+'°';const g=In.lastG,now=performance.now()/1e3;for(const l of labEls.lamps){
const id=l.dataset.g
;const hit=g&&now-g.time<.45&&(g.t==='turn'&&id==='turn'+g.dir||g.t==='jump'&&id==='jump'||g.t==='slide'&&id==='slide'||g.t==='dash'&&id==='dash'+g.dir)
;l.classList.toggle('hit',!!hit)}In.gq.length=0}boot();requestAnimationFrame(frame);
