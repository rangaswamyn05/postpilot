"use strict";
/* ============ PostPilot: built from the design screens ============ */
const $=(s,r=document)=>r.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MAX_EDIT=2048,THUMB=360,FEEDBACK_URL=""; // set FEEDBACK_URL to a backend later
const FMT=n=>Number(n).toLocaleString('en-US');

const BIZ=[
 {n:'Photography studio',p:'photography studios',focus:0,look:0},
 {n:'Restaurant / Cafe',p:'restaurants and cafes',focus:1,look:2},
 {n:'Retail / Boutique',p:'boutiques',focus:1,look:0},
 {n:'Salon / Beauty',p:'salons',focus:1,look:2},
 {n:'Fitness / Wellness',p:'fitness and wellness studios',focus:2,look:2},
 {n:'Real estate',p:'real estate',focus:2,look:0},
 {n:'Artist',p:'artists',focus:1,look:1},
 {n:'Other',p:'your business',focus:0,look:2}];
const FOCUS=['Tell the story','Best individual shots','Wide variety of moments','People and portraits'];
/* look = a full grade, not a brightness slider.
   T target median, sh shadow lift, hl highlight recovery, con S-curve, blk black lift, clar local contrast,
   vib vibrance, sat saturation, grn green/aqua desaturation, warm temperature, shT/hiT split tone, wb auto white balance strength */
const LOOKS=[
 {n:'Bright and airy',p:{T:.56,sh:.55,hl:.45,con:.12,blk:.03,clar:.16,vib:.12,sat:-.04,grn:-.28,warm:.035,shT:-.10,hiT:.25,wb:.6}},
 {n:'Moody',p:{T:.38,sh:.10,hl:.60,con:.36,blk:.0,clar:.32,vib:-.05,sat:-.10,grn:-.22,warm:-.02,shT:.55,hiT:.20,wb:.5}},
 {n:'Natural',p:{T:.46,sh:.35,hl:.45,con:.20,blk:.01,clar:.20,vib:.14,sat:.0,grn:-.08,warm:.012,shT:.0,hiT:.05,wb:.55}}];
const PROMOTE=['A product','A service','An event','An offer','Brand story'];

const S={authed:false,biz:0,mode:'edit',source:null,photos:[],count:0,focus:0,focusNote:'',look:2,ref:null,crop:false,
 picked:[],order:[],changes:0,edited:[],tab:'after',promote:4,caption:'',capEdited:false,car:[],capIdx:0,reel:[],sig:'',seg:-1,music:0};

/* ---------- image processing (all in the browser) ---------- */
const bitmapOf=async f=>{try{return await createImageBitmap(f,{imageOrientation:'from-image'})}catch(e){return await createImageBitmap(f)}};
function drawContain(b,maxSide){const k=Math.min(1,maxSide/Math.max(b.width,b.height));const c=document.createElement('canvas');c.width=Math.round(b.width*k);c.height=Math.round(b.height*k);c.getContext('2d').drawImage(b,0,0,c.width,c.height);return c}
function drawCover(src,W,H){const c=document.createElement('canvas');c.width=W;c.height=H;const k=Math.max(W/src.width,H/src.height),w=src.width*k,h=src.height*k;c.getContext('2d').drawImage(src,(W-w)/2,(H-h)/2,w,h);return c}
function stats(cv){const w=Math.min(200,cv.width),h=Math.max(1,Math.round(cv.height*w/cv.width));const t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d');x.drawImage(cv,0,0,w,h);const d=x.getImageData(0,0,w,h).data;const n=w*h,hist=new Uint32Array(256);let sS=0,sRB=0,sh=0,shN=0,hi=0,hiN=0;
  for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],l=Math.round(.2126*r+.7152*g+.0722*b);hist[l]++;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);sS+=mx?(mx-mn)/mx:0;sRB+=r-b;if(l<80){sh+=r-b;shN++}if(l>180){hi+=r-b;hiN++}}
  const pct=q=>{let c=0;for(let i=0;i<256;i++){c+=hist[i];if(c>=q*n)return i}return 255};
  return{median:pct(.5)/255,p5:pct(.05),p95:pct(.95),spread:Math.max(20,pct(.95)-pct(.05)),sat:sS/n||.01,rb:sRB/n,shRB:shN?sh/shN:0,hiRB:hiN?hi/hiN:0}}
function sharpScore(cv){const w=200,h=Math.max(8,Math.round(cv.height*w/cv.width));const t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d');x.drawImage(cv,0,0,w,h);const d=x.getImageData(0,0,w,h).data,g=new Float32Array(w*h);for(let i=0,j=0;j<g.length;i+=4,j++)g[j]=.299*d[i]+.587*d[i+1]+.114*d[i+2];let s=0,s2=0,n=0,sum=0;for(let y=1;y<h-1;y++)for(let xx=1;xx<w-1;xx++){const k=y*w+xx,l=4*g[k]-g[k-1]-g[k+1]-g[k-w]-g[k+w];s+=l;s2+=l*l;n++}for(let j=0;j<g.length;j++)sum+=g[j];const mean=sum/g.length;return{sharp:s2/n-(s/n)**2,expo:1-Math.min(1,Math.abs(mean-125)/125)}}
function dhash(cv){const t=document.createElement('canvas');t.width=9;t.height=8;const x=t.getContext('2d');x.drawImage(cv,0,0,9,8);const d=x.getImageData(0,0,9,8).data,bits=[];for(let y=0;y<8;y++)for(let xx=0;xx<8;xx++){const a=d[(y*9+xx)*4]+d[(y*9+xx)*4+1]+d[(y*9+xx)*4+2],b=d[(y*9+xx+1)*4]+d[(y*9+xx+1)*4+1]+d[(y*9+xx+1)*4+2];bits.push(a>b?1:0)}return bits}
const ham=(a,b)=>{let n=0;for(let i=0;i<64;i++)if(a[i]!==b[i])n++;return n};
/* ---------- professional edit engine ---------- */
const LIN=(()=>{const t=new Float32Array(256);for(let i=0;i<256;i++){const c=i/255;t[i]=c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)}return t})();
const ENC=(()=>{const t=new Uint8ClampedArray(4096);for(let i=0;i<4096;i++){const c=i/4095;t[i]=Math.round(255*(c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055))}return t})();
const G22=(()=>{const t=new Float32Array(4096);for(let i=0;i<4096;i++)t[i]=Math.pow(i/4095,1/2.2);return t})();
const G22I=(()=>{const t=new Float32Array(4096);for(let i=0;i<4096;i++)t[i]=Math.pow(i/4095,2.2);return t})();
const sstep=(a,b,x)=>{x=(x-a)/(b-a);x=x<0?0:x>1?1:x;return x*x*(3-2*x)};
function boxBlur(src,w,h,r,passes=3){
  let a=new Float32Array(src),b=new Float32Array(src.length);
  for(let p=0;p<passes;p++){
    for(let y=0;y<h;y++){let acc=0;const o=y*w;for(let x=-r;x<=r;x++)acc+=a[o+Math.min(w-1,Math.max(0,x))];
      for(let x=0;x<w;x++){b[o+x]=acc/(2*r+1);acc+=a[o+Math.min(w-1,x+r+1)]-a[o+Math.max(0,x-r)]}}
    for(let x=0;x<w;x++){let acc=0;for(let y=-r;y<=r;y++)acc+=b[Math.min(h-1,Math.max(0,y))*w+x];
      for(let y=0;y<h;y++){a[y*w+x]=acc/(2*r+1);acc+=b[Math.min(h-1,y+r+1)*w+x]-b[Math.max(0,y-r)*w+x]}}
  }
  return a;
}
function applyEdit(cv,P,opt={}){
  const w=cv.width,h=cv.height,n=w*h,ctx=cv.getContext('2d'),im=ctx.getImageData(0,0,w,h),d=im.data;
  /* 0. clean first: remove colour speckle and noise-sized luminance wobble before anything is brightened. Real edges are left alone. */
  {const L0=new Float32Array(n),DR=new Float32Array(n),DB=new Float32Array(n);
   for(let p=0,i=0;p<n;p++,i+=4){const r=d[i],g=d[i+1],b=d[i+2],l=.2126*r+.7152*g+.0722*b;L0[p]=l;DR[p]=r-l;DB[p]=b-l}
   const rs=Math.max(1,Math.round(Math.max(w,h)/700));
   const Ls=boxBlur(L0,w,h,rs,2),Rs=boxBlur(DR,w,h,Math.max(2,rs*2),2),Bs=boxBlur(DB,w,h,Math.max(2,rs*2),2);
   for(let p=0,i=0;p<n;p++,i+=4){
     const dl=L0[p]-Ls[p],ad=dl<0?-dl:dl;
     const kl=(1-sstep(5,16,ad))*(.45+.4*(1-L0[p]/255)),cf=(1-sstep(10,35,ad))*.85;
     const l=L0[p]-dl*kl,dr=DR[p]+(Rs[p]-DR[p])*cf,db=DB[p]+(Bs[p]-DB[p])*cf;
     let r=l+dr,b=l+db,g=(l-.2126*r-.0722*b)/.7152;
     d[i]=r<0?0:r>255?255:r;d[i+1]=g<0?0:g>255?255:g;d[i+2]=b<0?0:b>255?255:b}}
  /* 1. read the photo: median brightness and a neutral-balance estimate from the midtones */
  const hist=new Uint32Array(256);let ar=0,ag=0,ab=0,mn=0,cnt=0;
  const step=Math.max(1,Math.floor(n/60000));
  for(let p=0;p<n;p+=step){const i=p*4,l=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);hist[l]++;cnt++;
    if(l>50&&l<215){ar+=LIN[d[i]];ag+=LIN[d[i+1]];ab+=LIN[d[i+2]];mn++}}
  let tot=0,vmed=.5;for(let i=0;i<256;i++){tot+=hist[i];if(tot>=.5*cnt){vmed=Math.max(.04,i/255);break}}
  /* auto exposure: bring each photo toward the look's target, but only part of the way so dark rooms stay dark */
  let eg=Math.pow(P.T/vmed,2.2);eg=Math.pow(clamp(eg,.6,1.8),.8);
  /* auto white balance: gray-world on the midtones, limited, plus the look's temperature */
  let gr=1,gg=1,gb=1;if(mn>200&&P.wb>0){const mr=ar/mn,mg=ag/mn,mb=ab/mn,m=(mr+mg+mb)/3;
    gr=1+clamp(m/mr-1,-.14,.14)*P.wb;gg=1+clamp(m/mg-1,-.14,.14)*P.wb;gb=1+clamp(m/mb-1,-.14,.14)*P.wb}
  gr*=1+P.warm*.6;gb*=1-P.warm*.6;
  /* 2. tone: shadow and highlight recovery, filmic S-curve, black point, split-toning, all on luminance */
  for(let p=0;p<n;p++){
    const i=p*4;let r=LIN[d[i]]*gr*eg,g=LIN[d[i+1]]*gg*eg,b=LIN[d[i+2]]*gb*eg;
    let Y=.2126*r+.7152*g+.0722*b;if(Y<1e-5)Y=1e-5;
    let v=G22[Math.min(4095,(Y*4095)|0)];
    v+=P.sh*.16*(1-sstep(.04,.55,v));
    v-=P.hl*.20*sstep(.55,1.0,v);
    if(v>.88)v=.88+(v-.88)*.55;
    v+=P.con*(v*v*(3-2*v)-v);
    v=P.blk+v*(1-P.blk);v=v<0?0:v>1?1:v;
    let k=G22I[(v*4095)|0]/Y;if(k>2.2)k=2.2;r*=k;g*=k;b*=k;
    const ws=(1-v)*(1-v),wh=v*v;
    r+=-P.shT*.012*ws+P.hiT*.012*wh;b+=P.shT*.016*ws-P.hiT*.014*wh;g+=P.shT*.004*ws+P.hiT*.002*wh;
    r=r<0?0:r>1?1:r;g=g<0?0:g>1?1:g;b=b<0?0:b>1?1:b;
    d[i]=ENC[(r*4095)|0];d[i+1]=ENC[(g*4095)|0];d[i+2]=ENC[(b*4095)|0];
  }
  /* 3. local contrast from a wide blur (midtones only), then colour work */
  const L=new Float32Array(n);for(let p=0,i=0;p<n;p++,i+=4)L[p]=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
  const blur=P.clar?boxBlur(L,w,h,Math.max(4,Math.round(Math.max(w,h)/55))):null;
  for(let p=0;p<n;p++){
    const i=p*4;let r=d[i],g=d[i+1],b=d[i+2];const l0=L[p];
    if(blur){const mid=1-Math.pow(Math.abs(l0/127.5-1),2.2);let add=(l0-blur[p])*P.clar*.8*mid;add=add<-12?-12:add>12?12:add;r+=add;g+=add;b+=add;r=r<0?0:r>255?255:r;g=g<0?0:g>255?255:g;b=b<0?0:b>255?255:b}
    const mx=Math.max(r,g,b),mi=Math.min(r,g,b);
    if(mx>1){
      const sat=(mx-mi)/mx;let f=1+P.sat;
      let hue=0;if(mx>mi){const dd=mx-mi;hue=mx===r?((g-b)/dd+6)%6:mx===g?(b-r)/dd+2:(r-g)/dd+4;hue*=60}
      f+=P.vib*Math.pow(1-sat,1.5)*(hue>8&&hue<50?.35:1);
      if(hue>70&&hue<190&&P.grn)f+=P.grn*Math.min(1,sat*2.2);
      const l=.2126*r+.7152*g+.0722*b;r=l+(r-l)*f;g=l+(g-l)*f;b=l+(b-l)*f;
    }
    d[i]=r<0?0:r>255?255:r;d[i+1]=g<0?0:g>255?255:g;d[i+2]=b<0?0:b>255?255:b;
  }
  /* 4. finishing sharpen on luminance only, with a noise threshold */
  if(opt.sharpen===true){
    for(let p=0,i=0;p<n;p++,i+=4)L[p]=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
    const sm=boxBlur(L,w,h,Math.max(1,Math.round(Math.max(w,h)/1600)),2),amt=.55;
    for(let p=0,i=0;p<n;p++,i+=4){let df=L[p]-sm[p];if(df>-2&&df<2)continue;df*=amt;
      const r=d[i]+df,g=d[i+1]+df,b=d[i+2]+df;d[i]=r<0?0:r>255?255:r;d[i+1]=g<0?0:g>255?255:g;d[i+2]=b<0?0:b>255?255:b}
  }
  ctx.putImageData(im,0,0);return cv;
}
/* a reference photo becomes a full grade: target brightness, contrast, colour strength, warmth and split-tone */
function paramsFromRef(ref,src){
  return{...LOOKS[2].p,
   T:clamp(ref.median,.3,.66),
   con:clamp(.2+(ref.spread/src.spread-1)*.6,.02,.5),
   blk:clamp(ref.p5/255*.6,0,.06),
   vib:clamp((ref.sat/src.sat-1)*.8,-.3,.4),
   sat:clamp((ref.sat/src.sat-1)*.2,-.15,.15),
   warm:clamp((ref.rb-src.rb)/255,-.12,.15),
   shT:clamp((src.shRB-ref.shRB)/255*4,-1,1),
   hiT:clamp((ref.hiRB-src.hiRB)/255*4,-1,1)};
}
const paramsFor=cv=>S.ref?paramsFromRef(S.ref,stats(cv)):LOOKS[S.look].p;
const toBlob=(cv,q=.9)=>new Promise(r=>cv.toBlob(r,'image/jpeg',q));
const blobUrl=b=>URL.createObjectURL(b);
async function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url})}

/* ---------- zip (store only) ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=u=>{let c=~0;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(~c)>>>0};
async function makeZip(files){const parts=[],cen=[];let off=0;const enc=new TextEncoder();for(const f of files){const data=new Uint8Array(await f.blob.arrayBuffer()),nm=enc.encode(f.name),crc=crc32(data);const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,nm.length,true);parts.push(lh.buffer,nm,data);const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);cen.push(ch.buffer,nm);off+=30+nm.length+data.length}const csz=cen.reduce((a,b)=>a+(b.byteLength??b.length),0);const end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,csz,true);end.setUint32(16,off,true);return new Blob([...parts,...cen,end.buffer],{type:'application/zip'})}
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}

/* ---------- small UI helpers ---------- */
function toast(msg){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#201C18;color:#fff;padding:12px 18px;border-radius:14px;font:600 14px Manrope,sans-serif;z-index:50;max-width:340px;text-align:center;box-shadow:0 8px 24px rgba(29,26,23,.25)';document.body.append(t)}t.textContent=msg;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',3200)}
function busy(title){const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;background:rgba(32,28,24,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:40';m.innerHTML=`<div style="background:#fff;border-radius:18px;padding:20px;width:100%;max-width:340px;font-family:Manrope,sans-serif"><div style="font:500 20px Fraunces,Georgia,serif">${title}</div><div id="bm" style="font-size:13px;color:#6B6F7C;margin:6px 0 10px"></div><div style="height:8px;background:#E3DDD0;border-radius:8px;overflow:hidden"><div id="bb" style="height:100%;width:0;background:#7A5A1C"></div></div></div>`;document.body.append(m);return{set(i,n){$('#bm',m).textContent=`${i} of ${n}`;$('#bb',m).style.width=(i/n*100)+'%'},done(){m.remove()}}}
const tick=()=>new Promise(r=>setTimeout(r));
function findText(root,txt){return[...root.querySelectorAll('*')].find(e=>e.textContent.trim()===txt&&![...e.children].some(c=>c.textContent.trim()===txt))}
function up(el,pred){while(el&&!pred(el))el=el.parentElement;return el}
const styleOf=e=>e.getAttribute('style')||'';
const CHECK='<svg width="12" height="12" viewBox="0 0 12 12" style="fill: none; stroke: #FFFFFF; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round"><path d="M2.5 6.2l2.4 2.4 4.6-5"/></svg>';
const IND_ON='flex: none; width: 22px; height: 22px; box-sizing: border-box; border-radius: 11px; background: #201C18; display: flex; align-items: center; justify-content: center';
const IND_OFF='flex: none; width: 22px; height: 22px; box-sizing: border-box; border-radius: 11px; border: 1.5px solid #D9D2C2; background: #FFFFFF';
const SHADOW='; box-shadow: 0 6px 18px rgba(29,26,23,0.07)';
/* card group: one selected at a time, same look as the design */
function cardGroup(cards,sel,onPick,{hideOff=false}={}){
  const base=cards.map(c=>styleOf(c).replace('border: 1.5px solid #201C18','border: 1px solid #E3DDD0').replace(SHADOW,''));
  const paint=()=>cards.forEach((c,i)=>{const on=i===sel;c.setAttribute('style',on?base[i].replace('border: 1px solid #E3DDD0','border: 1.5px solid #201C18')+SHADOW:base[i]);
    let ind=[...c.querySelectorAll('[aria-hidden="true"]')].find(e=>/width: 22px/.test(styleOf(e)));
    if(!ind&&(on||!hideOff)){ind=document.createElement('div');ind.setAttribute('aria-hidden','true');(hideOff?c.firstElementChild:c).appendChild(ind)}
    if(ind){if(!on&&hideOff){ind.remove()}else{ind.setAttribute('style',on?IND_ON:IND_OFF);ind.innerHTML=on?CHECK:''}}});
  cards.forEach((c,i)=>{c.style.cursor='pointer';c.onclick=()=>{sel=i;paint();onPick(i)}});paint();
  return{set(i){sel=i;paint()}};
}
/* chip group */
function chipGroup(chips,sel,onPick){
  const un=styleOf(chips.find(c=>!/background: #201C18/.test(styleOf(c)))||chips[0]).replace(/background: #201C18/,'background: #FFFFFF').replace(/color: #FFFFFF/,'color: #201C18').replace(/border: 1px solid #201C18/,'border: 1px solid #E3DDD0');
  const on=un.replace('background: #FFFFFF','background: #201C18').replace('color: #201C18','color: #FFFFFF').replace('border: 1px solid #E3DDD0','border: 1px solid #201C18');
  const paint=()=>chips.forEach((c,i)=>{c.setAttribute('style',(i===sel?on:un)+';cursor:pointer')});
  chips.forEach((c,i)=>c.onclick=()=>{sel=i;paint();onPick(i)});paint();
}
function pickImage(cb){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files[0];if(f)cb(f)};i.click()}
async function setRefFile(f){S.ref=stats(drawContain(await bitmapOf(f),400));toast('Reference saved. We match its look.')}

/* ---------- ranking ---------- */
async function rank(){
  const N=S.photos.length,k=Math.min(Math.max(1,S.count||1),N);
  const sh=[...S.photos].sort((a,b)=>a.sharp-b.sharp),pc=new Map(sh.map((p,i)=>[p.id,i/(N-1||1)]));
  S.photos.forEach(p=>p.score=pc.get(p.id)*.7+p.expo*.3);
  if(S.focus===3&&'FaceDetector'in window&&N<=2000){
    try{const fd=new FaceDetector({fastMode:true}),b=busy('Looking for people');let i=0;
      for(const p of S.photos){try{const im=await loadImg(p.url);const f=await fd.detect(im);p.score+=f.length?0.5:0}catch(e){}b.set(++i,N);if(i%10===0)await tick()}b.done()}catch(e){}
  }else if(S.focus===3){toast("Face detection isn't available in this browser, so we used Best individual shots.")}
  const thr=S.focus===2?12:6,byScore=[...S.photos].sort((a,b)=>b.score-a.score),out=[];
  const dupe=p=>out.some(q=>ham(q.hash,p.hash)<=thr);
  if(S.focus===0){ // spread across the shoot: best from each time slice
    const byTime=[...S.photos].sort((a,b)=>a.time-b.time||a.id-b.id),slices=Math.min(k,12),per=Math.ceil(N/slices);
    for(let s=0;s<slices;s++){const part=byTime.slice(s*per,(s+1)*per).sort((a,b)=>b.score-a.score),want=Math.round(k*(s+1)/slices)-Math.round(k*s/slices);let got=0;for(const p of part){if(got>=want)break;if(!dupe(p)){out.push(p);got++}}}
  }
  for(const p of byScore){if(out.length>=k)break;if(!out.includes(p)&&!dupe(p))out.push(p)}
  for(const p of byScore){if(out.length>=k)break;if(!out.includes(p))out.push(p)}
  S.picked=out.slice(0,k).map(p=>p.id).sort((a,b)=>S.photos[a].time-S.photos[b].time||a-b);
  S.order=byScore.map(p=>p.id);
}

/* ---------- ingest ---------- */
async function ingest(files,kind){
  S.photos.forEach(p=>URL.revokeObjectURL(p.url));S.photos=[];S.picked=[];S.count=0;S.changes=0;S.edited=[];S.sig='';S.source=kind;
  const b=busy('Making previews');
  for(let i=0;i<files.length;i++){
    try{const bm=await bitmapOf(files[i]),cv=drawContain(bm,THUMB);bm.close&&bm.close();const sc=sharpScore(cv);
      S.photos.push({id:S.photos.length,name:files[i].name,file:files[i],time:files[i].lastModified||0,url:blobUrl(await toBlob(cv,.7)),sharp:sc.sharp,expo:sc.expo,hash:dhash(cv)})}catch(e){}
    if(i%5===0||i===files.length-1){b.set(i+1,files.length);await tick()}
  }
  b.done();
  if(kind==='upload'){S.mode='edit';S.picked=S.photos.map(p=>p.id)}
}
async function useSamples(){
  S.photos.forEach(p=>URL.revokeObjectURL(p.url));S.photos=[];S.edited=[];S.sig='';S.source='device';S.changes=0;
  const b=busy('Loading sample photos');
  for(let i=0;i<SAMPLES.length;i++){const blob=await (await fetch(SAMPLES[i])).blob();const f=new File([blob],`sample-${i+1}.jpg`,{type:'image/jpeg',lastModified:Date.now()-(SAMPLES.length-i)*60000});
    const bm=await bitmapOf(f),cv=drawContain(bm,THUMB),sc=sharpScore(cv);S.photos.push({id:i,name:f.name,file:f,time:f.lastModified,url:blobUrl(await toBlob(cv,.7)),sharp:sc.sharp,expo:sc.expo,hash:dhash(cv)});b.set(i+1,SAMPLES.length)}
  b.done();
}

/* ---------- navigation ---------- */
const root=()=>$('#app');
async function go(name){if(S.screen!==name){try{history.pushState({s:name},'')}catch(e){}}S.screen=name;await render()}
window.addEventListener('popstate',e=>{const t=e.state&&e.state.s;if(!t||t==='login'){S.screen='login';loginScreen()}else{S.screen=t;render()}});
function imgFor(name,i){
  const ph='data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const th=ix=>{const p=S.photos[ix];return p?p.url:ph};
  if(name==='EditStyle')return S.swatch?S.swatch[i]:ph;
  if(name==='Review')return th(S.picked[i]);
  if(name==='Sample')return i?(S.sAfter||ph):(S.sBefore||ph);
  if(name==='Results'){const e=S.edited;if(!e.length)return ph;const show=ix=>S.tab==='after'?e[ix%e.length].thumb:th(e[ix%e.length].src);if(i<3)return show(i);if(i<7)return e[(S.car[i-3]??0)].thumb;if(i===7)return e[S.capIdx%e.length].thumb;return e[S.reel[i-8]??0].thumb}
  return ph;
}
async function render(){
  const name=S.screen;let html=SCREENS[name];
  const N=S.photos.length,K=S.picked.length||S.count||0;
  html=html.replace(/3,412/g,FMT(N)).replace(/3412/g,N).replace(/\b150\b/g,FMT(K));
  if(name==='EditStyle')await ensureSwatches();
  if(name==='Sample')await ensureSample();
  const r=root();r.innerHTML=html.replace(/@@I(\d+)@@/g,(m,i)=>imgFor(name,+i));
  const f=r.firstElementChild;f.style.width='100%';f.style.maxWidth='430px';f.style.height='auto';f.style.minHeight='100vh';f.style.margin='0 auto';
  r.querySelectorAll('a[data-go]').forEach(a=>a.onclick=e=>{e.preventDefault();go(a.dataset.go)});
  const hdr=f.firstElementChild&&f.firstElementChild.firstElementChild&&f.firstElementChild.firstElementChild.firstElementChild;
  if(hdr){const bk=document.createElement('div');bk.setAttribute('role','button');bk.setAttribute('aria-label','Back');bk.textContent='‹';
    bk.style.cssText='width:30px;height:30px;border-radius:15px;border:1px solid #E3DDD0;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;cursor:pointer;margin-right:2px;padding-bottom:3px;box-sizing:border-box';
    bk.onclick=()=>{try{history.back()}catch(e){loginScreen()}};hdr.insertBefore(bk,hdr.firstChild);hdr.style.gap='8px'}
  window.scrollTo(0,0);
  await (BIND[name]&&BIND[name](r));
}

/* ---------- screens ---------- */
const BIND={};
BIND.About=r=>{
  const grid=r.querySelector('div[style*="repeat(2"]'),cards=[...grid.children];
  const sug=findText(r,'Suggested for photography studios: focus on Tell the story, with a Bright and airy look.')||[...r.querySelectorAll('div')].find(d=>/Suggested for/.test(d.textContent)&&d.children.length===1&&d.firstElementChild.tagName==='DIV');
  const box=[...r.querySelectorAll('b')].find(b=>/Suggested for/.test(b.textContent)).parentElement;
  const upd=i=>{const b=BIZ[i];box.innerHTML=`<b>Suggested for ${b.p}:</b> focus on ${FOCUS[b.focus]}, with a ${LOOKS[b.look].n} look.`};
  cardGroup(cards,S.biz,i=>{S.biz=i;S.focus=BIZ[i].focus;S.look=BIZ[i].look;S.ref=null;upd(i)},{hideOff:true});upd(S.biz);
  S.focus=S.focus||BIZ[S.biz].focus;
  findText(r,'Continue').onclick=e=>{e.preventDefault();S.focus=BIZ[S.biz].focus;S.look=BIZ[S.biz].look;go('Mode')};
};
BIND.Mode=r=>{
  const c1=up(findText(r,'Shortlist my best photos'),e=>/border-radius: 18px/.test(styleOf(e)));
  const cards=[...c1.parentElement.children];
  cardGroup(cards,S.mode==='select'?0:1,i=>{S.mode=i?'edit':'select'});
};
BIND.Connect=r=>{
  const c=up(findText(r,'Google Drive'),e=>/border-radius: 18px/.test(styleOf(e))),cards=[...c.parentElement.children];
  const sel=S.source==='device'?2:S.source==='upload'?3:-1;
  const g=cardGroup(cards,sel,i=>{
    if(i<2){g.set(-1);toast(`${i?'Dropbox':'Google Drive'} is coming in the next version. Use This device or Upload.`);return}
    const kind=i===2?'device':'upload',inp=document.createElement('input');inp.type='file';inp.multiple=true;inp.accept='image/*';if(kind==='device')inp.webkitdirectory=true;
    inp.onchange=async()=>{const fs=[...inp.files].filter(f=>f.type.startsWith('image/'));if(!fs.length){g.set(-1);return}await ingest(fs,kind);await render()};
    inp.oncancel=()=>g.set(S.source==='device'?2:S.source==='upload'?3:-1);inp.click();
  });
  const sumTitle=findText(r,'October wedding shoot'),sumBox=up(sumTitle,e=>/border-radius/.test(styleOf(e))&&e.querySelector('div')&&/Change/.test(e.textContent));
  if(S.photos.length){sumTitle.textContent=S.source==='upload'?'Uploaded photos':'Your folder';findText(sumBox,`${FMT(S.photos.length)} photos in this folder`).textContent=`${FMT(S.photos.length)} photos ready`;const ch=findText(sumBox,'Change');ch.style.cursor='pointer';ch.onclick=()=>cards[S.source==='upload'?3:2].click()}else sumBox.style.display='none';
  const sample=r.querySelector('a[data-go="Choose"]:not([style*="min-height"])');
  if(sample)sample.onclick=async e=>{e.preventDefault();await useSamples();await render()};
  const cta=[...r.querySelectorAll('a[data-go="Choose"]')].pop();
  cta.onclick=e=>{e.preventDefault();if(!S.photos.length){toast('Choose This device or Upload first.');return}go(S.source==='upload'?'EditStyle':'Choose')};
};
BIND.Choose=r=>{
  const N=S.photos.length,inp=$('#how-many',r);S.count=S.count||clamp(Math.round(N*.1),1,N);inp.value=S.count;inp.max=N;
  const set=v=>{S.count=clamp(Math.round(+v)||1,1,N);inp.value=S.count};
  r.querySelector('[aria-label="Fewer photos"]').onclick=()=>set(S.count-1);r.querySelector('[aria-label="More photos"]').onclick=()=>set(S.count+1);inp.onchange=()=>set(inp.value);
  const chips=[...findText(r,'Tell the story').parentElement.children];chipGroup(chips,S.focus,i=>S.focus=i);
  const note=$('#focus-note',r);note.value=S.focusNote;note.oninput=()=>S.focusNote=note.value;
  const taste=r.querySelector('a[data-go="Choose"]:not([style*="min-height"])');if(taste)taste.onclick=e=>{e.preventDefault();pickImage(setRefFile)};
  const cta=[...r.querySelectorAll('a[data-go="EditStyle"]')].pop();
  cta.onclick=async e=>{e.preventDefault();set(inp.value);if(S.mode==='select'){const b=busy('Finding your best photos');await tick();await rank();b.done();go('Review')}else go('EditStyle')};
};
async function ensureSwatches(){
  if(!S.photos.length){S.swatch=SAMPLES.slice(0,3);return}
  const p=S.photos[S.picked[0]??0],im=await loadImg(p.url);
  S.swatch=LOOKS.map(L=>{const c=drawCover(im,300,300);applyEdit(c,L.p);return c.toDataURL('image/jpeg',.8)});
}
BIND.EditStyle=r=>{
  const c=up(findText(r,'Bright and airy'),e=>/border-radius: 16px/.test(styleOf(e)));const cards=[...c.parentElement.children];
  cardGroup(cards,S.look,i=>{S.look=i;S.ref=null});
  const adj=[up(findText(r,'Colour and light'),e=>/border-radius/.test(styleOf(e))&&e.querySelector('[aria-hidden]')),up(findText(r,'Colour, light and crop'),e=>/border-radius/.test(styleOf(e))&&e.querySelector('[aria-hidden]'))];
  cardGroup(adj,S.crop?1:0,i=>S.crop=!!i);
  const ref=[...r.querySelectorAll('a[data-go="EditStyle"]')][0];ref.onclick=e=>{e.preventDefault();pickImage(setRefFile)};
  const cta=r.querySelector('a[data-go="Review"]');
  cta.onclick=async e=>{e.preventDefault();
    if(S.source==='upload'){S.picked=S.photos.map(p=>p.id);return go('Sample')}
    const b=busy('Finding your best photos');await tick();await rank();b.done();go('Review')};
};
BIND.Review=r=>{
  const N=S.photos.length,K=S.picked.length;
  const chips=[...r.querySelector('div[style*="flex-wrap: wrap"]').children],grid=r.querySelector('div[style*="repeat(3"]'),tpl=grid.firstElementChild;
  const names=['Start','Early','Middle','End'],segs=Math.min(4,Math.max(1,K));
  const segOf=(i)=>Math.min(segs-1,Math.floor(i*segs/K));
  chips.forEach((c,i)=>{if(i>=segs)c.style.display='none'});
  const draw=()=>{
    const idxs=S.picked.map((id,i)=>({id,i})).filter(x=>S.seg<0||segOf(x.i)===S.seg).slice(0,60);
    grid.innerHTML='';
    idxs.forEach(({id,i})=>{const t=tpl.cloneNode(true);t.innerHTML='';t.style.background=`url(${S.photos[id].url}) center / cover`;t.style.cursor='pointer';
      t.onclick=()=>{const seg=segOf(i);const cand=S.order.find(o=>!S.picked.includes(o)&&S.photos[o]&&Math.abs(S.photos[o].time-S.photos[id].time)>=0);
        if(cand===undefined){toast('No other photos to swap in.');return}S.picked[i]=cand;draw()};grid.append(t)});
    findText(r,'Showing 6 of '+FMT(K)+'. Tap a photo to swap it for the next best one from its moment.')&&0;
    const note=[...r.querySelectorAll('div')].find(d=>/^Showing \d+ of/.test(d.textContent.trim())&&d.children.length===0);
    if(note)note.textContent=`Showing ${idxs.length} of ${FMT(K)}. Tap a photo to swap it for the next best one.`;
    chips.forEach((c,i)=>{if(i<segs){const n=S.picked.filter((_,j)=>segOf(j)===i).length;c.textContent=`${names[i]} ${n}`}});
  };
  S.seg=-1;chipGroup(chips.slice(0,segs),-1,i=>{S.seg=S.seg===i?-1:i;draw()});draw();
  const head=[...r.querySelectorAll('div')].find(d=>/picked from/.test(d.textContent)&&d.children.length===0);
  const cta=r.querySelector('a[data-go="Sample"]');cta.textContent=S.mode==='select'?`Download my ${FMT(K)} photos`:'See a sample edit';
  cta.onclick=e=>{e.preventDefault();S.mode==='select'?go('Results'):go('Sample')};
  const drive=findText(r,'Save as a folder in Google Drive');drive.onclick=e=>{e.preventDefault();toast('Saving to Google Drive is coming in the next version.')};
};
async function ensureSample(){
  const p=S.photos[S.picked[0]??0];if(!p)return;
  const bm=await bitmapOf(p.file),a=drawContain(bm,800);bm.close&&bm.close();
  const b=document.createElement('canvas');b.width=a.width;b.height=a.height;b.getContext('2d').drawImage(a,0,0);applyEdit(b,paramsFor(a));
  S.sBefore=blobUrl(await toBlob(a,.85));S.sAfter=blobUrl(await toBlob(b,.85));
}
BIND.Sample=r=>{
  const box=r.querySelector('div[style*="width: 346px"]'),L=[...box.children],after=L[1],line=L[2],knob=L[3];
  const setPos=pct=>{pct=clamp(pct,2,98);after.style.clipPath=`inset(0 0 0 ${pct}%)`;line.style.left=`calc(${pct}% - 1px)`;knob.style.left=`calc(${pct}% - 13px)`};
  setPos(50);
  const mv=e=>{const rc=box.getBoundingClientRect();setPos((e.clientX-rc.left)/rc.width*100)};
  box.style.touchAction='none';box.onpointerdown=e=>{mv(e);box.setPointerCapture(e.pointerId)};box.onpointermove=e=>{if(e.buttons)mv(e)};
  const line1=[...r.querySelectorAll('div')].find(d=>/^Your look:/.test(d.textContent.trim())&&d.querySelector('b')&&d.children.length===1);
  const chipsWrap=up(findText(r,'Moody'),e=>e.children.length===3&&e!==findText(r,'Moody'));const chips=[...findText(r,'Moody').parentElement.children];
  const upd=()=>{const nm=S.ref&&S.look<0?'Your reference':LOOKS[S.look].n;line1.innerHTML=`Your look: <b style="color: #201C18">${S.ref?'Your reference':nm}</b>. ${S.changes>=3?'You have used all 3 changes.':`Not right? Try another (up to 3 changes). Used ${S.changes} of 3.`}`};
  chipGroup(chips,S.ref?-1:S.look,async i=>{
    if(S.changes>=3){toast('You have used all 3 changes. Approve this look, or add a reference.');return}
    if(i!==S.look||S.ref){S.changes++;S.look=i;S.ref=null;await ensureSample();await render()}});
  if(S.changes>=3)chips.forEach(c=>c.style.opacity='.5');upd();
  const ref=r.querySelector('a[data-go="Sample"]:not([style*="min-height"])');ref.onclick=e=>{e.preventDefault();pickImage(async f=>{await setRefFile(f);S.changes=Math.min(3,S.changes+1);await ensureSample();await render()})};
  const cta=[...r.querySelectorAll('a[data-go="Results"]')].pop();cta.onclick=e=>{e.preventDefault();go('Results')};
};

/* ---------- full edit, content, results ---------- */
function sigNow(){return [S.picked.join(','),S.mode,S.look,S.ref?JSON.stringify(S.ref):'',S.crop].join('|')}
async function editOne(p,wantEdit){
  const bm=await bitmapOf(p.file);let cv=drawContain(bm,MAX_EDIT);bm.close&&bm.close();
  if(wantEdit)applyEdit(cv,paramsFor(cv));
  if(S.crop){const h=Math.min(cv.height,Math.round(cv.width*5/4)),w=Math.min(cv.width,Math.round(cv.height*4/5));const W=Math.min(cv.width,w),H=Math.round(W*5/4);cv=drawCover(cv,W,Math.min(H,cv.height))}
  const full=await toBlob(cv,.92),t=drawContain(cv,THUMB);return{src:p.id,name:p.name.replace(/\.[^.]+$/,'')+(wantEdit?'-edited':'')+'.jpg',blob:full,thumb:blobUrl(await toBlob(t,.75))};
}
async function processAll(){
  const sig=sigNow();if(S.sig===sig&&S.edited.length)return;
  const wantEdit=S.mode==='edit',b=busy(wantEdit?'Editing your photos':'Preparing your photos');
  S.edited.forEach(e=>URL.revokeObjectURL(e.thumb));S.edited=[];
  let failed=0;
  try{for(let i=0;i<S.picked.length;i++){try{S.edited.push(await editOne(S.photos[S.picked[i]],wantEdit))}catch(e){failed++;console.error(e)}b.set(i+1,S.picked.length);await tick()}}
  finally{b.done()}
  if(failed)toast(`${failed} photo${failed>1?'s':''} could not be read and ${failed>1?'were':'was'} skipped.`);
  S.sig=sig;
  const n=S.edited.length;S.car=[...Array(Math.min(4,n)).keys()];S.capIdx=n>1?1:0;S.reel=[...Array(Math.min(3,n)).keys()];S.capEdited=false;
}
/* captions are written for the business type and what is being promoted: [product, service, event, offer, brand story] */
const CAPS=[
 ['New work from the studio, fresh off the edit. Every frame was chosen for a reason. Which one is your favourite?','Your story deserves to be told well. We photograph the moments you will want back. Message us to talk about your date.','Booking now for upcoming sessions. Message us to hold your date. Who are you celebrating?','A little something for our next clients. Message us to ask what is included. Who should we send it to?','Behind every photo is a person and a moment. This is how we see it. What moment would you keep forever?'],
 ['Fresh from our kitchen. Come hungry. What would you order first?','Dine in, take away or let us cater. Message us to plan your table. Who are you bringing?','Join us at the table. Message us to reserve your seat. Who are you inviting?','A treat for our regulars and anyone new. Show this post when you visit. Who are you sharing it with?','Good food, made with care, served with a smile. This is who we are. What is your favourite dish here?'],
 ['New in the shop. Come in and see it in person. Which one would you pick first?','Need help choosing? Our team will style it with you. Message us to book a visit. What are you shopping for?','Join us in store. Come early and have a look around. Who are you bringing?','A little something for you this month. Message us to claim it. Which piece has your eye?','Every piece here is chosen by hand. This is why we do it. What is the best thing you own?'],
 ['New in the salon. Ask us about it on your next visit. Would you try it?','Book your chair and leave feeling like yourself, only better. Message us to book. What are you booking in for?','Join us at the salon. Spaces are limited, so message us to save yours. Who are you bringing?','A little something for your next visit. Message us to claim it. Who deserves a treat?','The people and the craft behind every chair. This is us. What is your favourite look you have had here?'],
 ['New at the studio. Come and try it. What would you start with?','Train with people who care about your progress. Message us to book your first session. What is your goal?','Join us for a session. Message us to save your spot. Who are you training with?','A little something for new members. Message us to claim it. Who should you bring along?','Real people, real progress, one session at a time. This is who we are. What keeps you coming back?'],
 ['New listing. Come and see it for yourself. Message us to book a viewing. Could you picture yourself here?','Buying, selling or renting, we will walk you through it. Message us to start. What are you looking for?','Open house. Come and walk through. Message us for the details. Who would you bring to see it?','Talk to us about your next move. Message us to ask what we can do for you. What matters most in a home?','Every home has a story. This is how we help people write the next chapter. What is your dream home?'],
 ['New work, fresh from the studio. Message me if you want to know more. Which piece speaks to you?','Commissions are open. Message me to talk about your idea. What would you like made?','Come and see the work in person. Message me for the details. Who are you bringing?','A little something for collectors this month. Message me to ask. Which piece would you take home?','The story behind the work, one piece at a time. This is how it starts. What does art mean to you?'],
 ['Meet our latest. Made with care, ready for you. Which one would you pick first?','Here is what we do best. Message us to book your spot. What would you like us to help with?','Save the date. We would love to see you there. Who are you bringing?','A little something for you this month. Message us to claim it. Who should we share it with?','The people and the work behind it, one frame at a time. Which moment would you keep forever?']];
function captionFor(){return CAPS[S.biz][S.promote]}
const cap=()=>{if(!S.capEdited)S.caption=captionFor();return S.caption};
BIND.Results=async r=>{
  if(!S.edited.length||S.sig!==sigNow()){await processAll();if(!S.edited.length){toast('We could not read these photos. Try JPEG or PNG files.');return go('Connect')}return render()}
  const wantEdit=S.mode==='edit',n=S.edited.length;
  const head=[...r.querySelectorAll('div')].find(d=>/photos, edited$/.test(d.textContent.trim())&&d.children.length===0);if(head)head.textContent=`${FMT(n)} photos, ${wantEdit?'edited':'picked'}`;
  const bef=findText(r,'Before'),aft=findText(r,'After'),seg=bef.parentElement;
  if(!wantEdit){seg.style.display='none'}
  const onSty=aft.getAttribute('style'),offSty=bef.getAttribute('style');
  const paint=()=>{const a=S.tab==='after';aft.setAttribute('style',a?onSty:offSty.replace('font-weight: 500','font-weight: 600').replace('color: #6B6F7C','color: #6B6F7C'));bef.setAttribute('style',a?offSty:onSty.replace('font-weight: 600','font-weight: 600'));};
  bef.style.cursor=aft.style.cursor='pointer';
  bef.onclick=()=>{S.tab='before';rerenderTiles()};aft.onclick=()=>{S.tab='after';rerenderTiles()};
  const rerenderTiles=()=>{const tiles=r.querySelectorAll('div[style*="repeat(3"] > div');tiles.forEach((t,i)=>{const e=S.edited[i%n];t.style.background=`url(${S.tab==='after'?e.thumb:S.photos[e.src].url}) center / cover`});
    const on=aft.getAttribute('style'),off=bef.getAttribute('style');
    const A=S.tab==='after';const sOn='flex: 1; padding: 9px 0; text-align: center; font-size: 14px; font-weight: 600; background: #FFFFFF; border-radius: 10px; box-shadow: 0 1px 4px rgba(29,26,23,0.1)',sOff='flex: 1; padding: 9px 0; text-align: center; font-size: 14px; font-weight: 500; color: #6B6F7C';
    aft.setAttribute('style',(A?sOn:sOff)+';cursor:pointer');bef.setAttribute('style',(A?sOff:sOn)+';cursor:pointer')};
  rerenderTiles();
  /* card thumbs for carousel, caption, reel */
  const cards=['Carousel','Captioned','Photo reel'].map(t=>up(findText(r,t),e=>/border-radius: 14px/.test(styleOf(e))));
  const fillRow=(card,idxs)=>{const row=card.firstElementChild,tpl=row.firstElementChild;row.innerHTML='';idxs.forEach(i=>{const t=tpl.cloneNode(true);t.style.background=`url(${S.edited[i%n].thumb}) center / cover`;t.style.flex='1 1 0';t.style.minWidth='0';row.append(t)})};
  fillRow(cards[0],S.car);fillRow(cards[1],[S.capIdx]);fillRow(cards[2],S.reel);
  const more=['Travel post','Corporate headshot','Passport photo'].map(t=>findText(r,t));more.forEach(m=>{m.style.cursor='pointer';m.onclick=()=>toast('More photo types are coming in the next version.')});
  const dl=findText(r,`Download all (${FMT(n)})`);
  dl.onclick=async e=>{e.preventDefault();const old=dl.textContent;dl.textContent='Packing your files…';
    const files=[];for(const x of S.edited)files.push({name:'photos/'+x.name,blob:x.blob});
    for(let i=0;i<S.car.length;i++)files.push({name:`carousel/slide-${i+1}.jpg`,blob:await toBlob(await slide(S.car[i]),.92)});
    files.push({name:'captioned-post/photo.jpg',blob:await toBlob(await slide(S.capIdx),.92)});
    files.push({name:'captioned-post/caption.txt',blob:new Blob([cap()],{type:'text/plain'})});
    save(await makeZip(files),'postpilot-content.zip');dl.textContent=old;feedback()};
  const drive=findText(r,'Save to Google Drive');drive.onclick=e=>{e.preventDefault();toast('Saving to Google Drive is coming in the next version.')};
  if(!wantEdit){const w=findText(r,'One consistent look across the whole set.');if(w)w.textContent='Your shortlist, ready to download.'}
};
async function slide(i,W=1080,H=1350){const bm=await createImageBitmap(S.edited[i%S.edited.length].blob);const c=drawCover(bm,W,H);bm.close&&bm.close();return c}

/* shared pieces for the three Customize screens */
function editedGrid(r,onPick,{exclude=[]}={}){
  const title=findText(r,'Your edited photos'),grid=title.nextElementSibling,tpl=grid.firstElementChild;
  const ids=S.edited.map((_,i)=>i).filter(i=>!exclude.includes(i)).slice(0,24);
  grid.innerHTML='';grid.style.gridTemplateColumns='repeat(4, minmax(0, 1fr))';
  ids.forEach(i=>{const t=tpl.cloneNode(true);const inner=t.firstElementChild;if(inner){inner.style.background=`url(${S.edited[i].thumb}) center / cover`}else t.style.background=`url(${S.edited[i].thumb}) center / cover`;t.style.cursor='pointer';t.onclick=()=>onPick(i);grid.append(t)});
}
function promoteChips(r,after){const chips=[...findText(r,'A product').parentElement.children];chipGroup(chips,S.promote,i=>{S.promote=i;if(!S.capEdited)after()})}
function captionBox(r){
  const lab=findText(r,'Caption'),box=lab.nextElementSibling;const ta=document.createElement('textarea');ta.rows=3;
  ta.value=cap();ta.setAttribute('style',(box.getAttribute('style')||'')+';width:100%;border:0;background:transparent;resize:none;font-family:inherit;outline:none;padding:0;color:#201C18');
  box.replaceWith(ta);ta.oninput=()=>{S.caption=ta.value;S.capEdited=true};return ta;
}
function refLink(r,redo){const a=r.querySelector('a[data-go="EditStyle"]');a.onclick=e=>{e.preventDefault();pickImage(async f=>{await setRefFile(f);const b=busy('Matching your reference');const ids=[...new Set([...S.car,S.capIdx,...S.reel])];for(let k=0;k<ids.length;k++){const old=S.edited[ids[k]];const ne=await editOne(S.photos[old.src],S.mode==='edit');URL.revokeObjectURL(old.thumb);S.edited[ids[k]]=ne;b.set(k+1,ids.length);await tick()}b.done();S.sig=sigNow();await render()})}}
function slotRow(r,list,{min,max,label}){
  const first=findText(r,'×')||[...r.querySelectorAll('div')].find(d=>d.textContent.trim()==='×');
  const slot=up(first,e=>e.querySelector('[aria-hidden="true"]')&&e.children.length===2),row=slot.parentElement,tpl=slot.cloneNode(true),plus=row.lastElementChild;
  const draw=()=>{[...row.children].forEach(c=>{if(c!==plus)c.remove()});
    list.forEach((ix,k)=>{const s=tpl.cloneNode(true);s.firstElementChild.style.background=`url(${S.edited[ix].thumb}) center / cover`;
      s.lastElementChild.style.cursor='pointer';s.lastElementChild.onclick=()=>{if(list.length<=min){toast(`Keep at least ${min} photos.`);return}list.splice(k,1);draw();row.dispatchEvent(new Event('change'))};row.insertBefore(s,plus)});
    plus.style.cursor='pointer'};
  plus.onclick=()=>{if(list.length>=max){toast(`Up to ${max} photos.`);return}const nx=S.edited.findIndex((_,i)=>!list.includes(i));if(nx<0){toast('No more photos to add.');return}list.push(nx);draw();row.dispatchEvent(new Event('change'))};
  draw();return{draw,add:i=>{if(list.length>=max){toast(`Up to ${max} photos.`);return}list.push(i);draw()}};
}
const doneBtn=r=>{const d=r.querySelector('a[data-go="Results"]');d.onclick=e=>{e.preventDefault();go('Results')};return d};
BIND.Customize=r=>{
  if(!S.edited.length)return go('Results');
  const ta=captionBox(r);promoteChips(r,()=>ta.value=cap());
  const sr=slotRow(r,S.car,{min:3,max:5});
  const redrawGrid=()=>editedGrid(r,i=>{sr.add(i);redrawGrid()},{exclude:S.car});redrawGrid();
  r.addEventListener('change',redrawGrid,true);
  refLink(r);doneBtn(r);
  findText(r,'Tap a photo below to add it. Tap x to remove one. 3 to 5 photos.')&&0;
};
BIND.Caption=r=>{
  if(!S.edited.length)return go('Results');
  const hero=up(findText(r,'Change photo'),e=>e.querySelector('[aria-hidden="true"]')&&e.children.length===2);const hbox=hero.firstElementChild;
  const setHero=()=>{hbox.style.background=`url(${S.edited[S.capIdx].thumb}) center / cover`};setHero();
  hero.style.cursor='pointer';hero.onclick=()=>{S.capIdx=(S.capIdx+1)%S.edited.length;setHero()};
  const ta=captionBox(r);promoteChips(r,()=>ta.value=cap());
  editedGrid(r,i=>{S.capIdx=i;setHero()});
  refLink(r);doneBtn(r);
};
BIND.Reel=r=>{
  if(!S.edited.length)return go('Results');
  slotRow(r,S.reel,{min:2,max:6});
  refLink(r);
  const tabs=[...findText(r,'Library').parentElement.children];
  const sOn=styleOf(tabs.find(t=>/background: #FFFFFF/.test(styleOf(t)))||tabs[0]),sOff=styleOf(tabs.find(t=>!/background: #FFFFFF/.test(styleOf(t)))||tabs[1]);
  const paintTabs=()=>tabs.forEach((t,i)=>t.setAttribute('style',(i===S.music?sOn:sOff)+';cursor:pointer'));
  tabs.forEach((t,i)=>t.onclick=()=>{S.music=i;paintTabs();if(i)toast('Trending sounds: download without music and add them inside Instagram.')});paintTabs();
  const trk=up(findText(r,'Golden Hour'),e=>/border-radius: 1[48]px/.test(styleOf(e))&&e.querySelector('[aria-hidden]'));
  if(trk)cardGroup([...trk.parentElement.children].filter(c=>c.querySelector('[aria-hidden]')&&/Warm|Upbeat|Soft/.test(c.textContent)),0,()=>{});
  [...r.querySelectorAll('div')].filter(d=>d.textContent.trim()==='▶').forEach(d=>{d.style.cursor='pointer';d.onclick=()=>toast('The music library is coming in the next version.')});
  const wm=r.querySelector('a[data-go="Results"]'),links=[...r.querySelectorAll('a[data-go="Results"]')],withM=links[0],withoutM=links[1];
  withM.onclick=e=>{e.preventDefault();toast('The music library is coming in the next version. Download without music for now.')};
  withoutM.onclick=async e=>{e.preventDefault();await makeReel()};
};
async function makeReel(){
  const mimes=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'];const mime=mimes.find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m));
  if(!mime){toast("This browser can't make video. Try Chrome or Safari.");return}
  const W=720,H=1280,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const imgs=[];for(const i of S.reel){const bm=await createImageBitmap(S.edited[i%S.edited.length].blob);imgs.push(bm)}
  const SEC=2.6,FADE=.5,total=imgs.length*SEC,rec=new MediaRecorder(c.captureStream(30),{mimeType:mime,videoBitsPerSecond:4e6}),chunks=[];
  rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);const b=busy('Making your reel');
  const draw=(img,a,z)=>{x.globalAlpha=a;const k=Math.max(W/img.width,H/img.height)*z,w=img.width*k,h=img.height*k;x.drawImage(img,(W-w)/2,(H-h)/2,w,h)};
  rec.start();const t0=performance.now();
  await new Promise(res=>{const f=()=>{const t=(performance.now()-t0)/1000;if(t>=total){res();return}
    x.globalAlpha=1;x.fillStyle='#000';x.fillRect(0,0,W,H);const i=Math.min(imgs.length-1,Math.floor(t/SEC)),lt=t-i*SEC;
    draw(imgs[i],1,1+lt*.02);if(lt<FADE&&i>0)draw(imgs[i-1],1-lt/FADE,1.0+SEC*.02);
    b.set(Math.min(imgs.length,i+1),imgs.length);requestAnimationFrame(f)};f()});
  rec.stop();await done;b.done();imgs.forEach(i=>i.close&&i.close());
  save(new Blob(chunks,{type:mime.split(';')[0]}),'postpilot-reel.'+(mime.includes('mp4')?'mp4':'webm'));await go('Results');feedback();
}

/* ---------- feedback ---------- */
function feedback(){
  let stars=0;const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;background:rgba(32,28,24,.5);display:flex;align-items:center;justify-content:center;padding:18px;z-index:60';
  const inp='width:100%;font:inherit;padding:12px;border:1px solid #E3DDD0;border-radius:12px;background:#fff;margin-bottom:10px;box-sizing:border-box';
  m.innerHTML=`<div style="background:#F9F6EF;border-radius:20px;padding:22px;width:100%;max-width:400px;font-family:Manrope,sans-serif"><div style="font:500 26px Fraunces,Georgia,serif;margin-bottom:6px">How was it?</div><div style="color:#6B6F7C;font-size:14px;margin-bottom:8px">Your feedback helps us make postpilot better.</div><div id="st" style="display:flex;gap:6px;font-size:34px;cursor:pointer;margin:6px 0 10px">${[1,2,3,4,5].map(i=>`<span data-i="${i}" style="color:#E3DDD0">★</span>`).join('')}</div><textarea id="fc" rows="3" placeholder="Anything we should change? (optional)" style="${inp}"></textarea><input id="fn" placeholder="Your name or business (optional)" style="${inp}"><button id="fs" style="width:100%;min-height:56px;border:0;border-radius:16px;background:#201C18;color:#fff;font:600 16px Manrope,sans-serif;cursor:pointer">Send feedback</button><button id="fx" style="width:100%;margin-top:8px;border:0;background:none;color:#6B6F7C;font:600 14px Manrope,sans-serif;padding:10px;cursor:pointer">Skip</button></div>`;
  document.body.append(m);
  $('#st',m).onclick=e=>{const i=+e.target.dataset.i;if(!i)return;stars=i;[...$('#st',m).children].forEach((s,k)=>s.style.color=k<i?'#C8941E':'#E3DDD0')};
  $('#fx',m).onclick=()=>m.remove();
  $('#fs',m).onclick=async()=>{const rec={stars,comment:$('#fc',m).value,who:$('#fn',m).value,business:BIZ[S.biz].n,photos:S.photos.length,picked:S.picked.length,mode:S.mode,at:new Date().toISOString()};
    try{const a=JSON.parse(localStorage.getItem('pp_feedback')||'[]');a.push(rec);localStorage.setItem('pp_feedback',JSON.stringify(a))}catch(e){}
    if(FEEDBACK_URL){try{await fetch(FEEDBACK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)})}catch(e){}}
    m.firstElementChild.innerHTML='<div style="font:500 26px Fraunces,Georgia,serif;margin-bottom:6px">Thank you</div><div style="color:#6B6F7C;font-size:14px;margin-bottom:14px">Your feedback is saved.</div><button id="ok" style="width:100%;min-height:56px;border:0;border-radius:16px;background:#201C18;color:#fff;font:600 16px Manrope,sans-serif;cursor:pointer">Close</button>';$('#ok',m).onclick=()=>m.remove()};
}

/* ---------- sign in (demo account) ---------- */
function loginScreen(){
  const r=root();const inp='width:100%;box-sizing:border-box;height:52px;padding:0 14px;border:1px solid #E3DDD0;border-radius:14px;background:#fff;font:500 16px Manrope,sans-serif;color:#201C18;margin-bottom:10px';
  r.innerHTML=`<div style="width:100%;max-width:430px;min-height:100vh;margin:0 auto;box-sizing:border-box;padding:26px 22px 30px;background:#F9F6EF;display:flex;flex-direction:column;gap:18px;font-family:Manrope,system-ui,sans-serif;color:#201C18">
   <div style="display:flex;align-items:center;gap:8px"><div style="width:26px;height:26px;border-radius:13px;background:#201C18;color:#D9B25F;display:flex;align-items:center;justify-content:center;font-size:13px">&#10022;</div><div style="font:500 20px Fraunces,Georgia,serif">postpilot</div></div>
   <div style="display:flex;flex-direction:column;gap:10px"><div style="font:500 32px/38px Fraunces,Georgia,serif;letter-spacing:-.8px">Turn a big shoot into posts, ready to publish</div><div style="font-size:15px;line-height:23px;color:#6B6F7C">Shortlist your best photos, edit them in one professional look, and get content ready for Instagram.</div></div>
   <div style="padding:12px 14px;background:#F5EBD1;border-radius:14px;font-size:13px;line-height:19px">Demo account: <b>demo@postpilot.app</b> / <b>PostPilot2026</b></div>
   <div><input id="em" type="email" value="demo@postpilot.app" style="${inp}"><input id="pw" type="password" placeholder="Password" style="${inp}"><div id="er" style="color:#a33;font-size:14px;margin-bottom:8px"></div></div>
   <div style="margin-top:auto"><a id="go" href="#" style="display:flex;align-items:center;justify-content:center;min-height:56px;box-sizing:border-box;border-radius:16px;background:#201C18;color:#fff;font-size:16px;font-weight:600;text-decoration:none">Sign in</a></div></div>`;
  const go_=()=>{if($('#em').value.trim().toLowerCase()==='demo@postpilot.app'&&$('#pw').value==='PostPilot2026'){S.authed=true;go('About')}else $('#er').textContent='Wrong email or password. Use the demo account above.'};
  $('#go').onclick=e=>{e.preventDefault();go_()};$('#pw').onkeydown=e=>{if(e.key==='Enter')go_()};
}
window.addEventListener('DOMContentLoaded',()=>{try{history.replaceState({s:'login'},'')}catch(e){}loginScreen()});
