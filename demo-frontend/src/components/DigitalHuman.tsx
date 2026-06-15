import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMLoaderPlugin,
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMUtils,
} from '@pixiv/three-vrm';

// ── Character Presets ──
export interface CharacterConfig {
  id: string; name: string; gender: 'male' | 'female';
  skinBase: string; skinShadow: string; lipColor: string;
  eyeColor: string; hairColor: string; browColor: string;
  outfitColor: string; voiceIndex: number; vrmUrl?: string;
}
const DEFAULT_VRM = `${import.meta.env.BASE_URL}models/AliciaSolid.vrm`;

export const CHARACTERS: CharacterConfig[] = [
  { id:'rem', name:'Rem', gender:'female', skinBase:'#fef0e8', skinShadow:'#f2c8b4', lipColor:'#e88090', eyeColor:'#3a6aaa', hairColor:'#7ab4e0', browColor:'#4a7aaa', outfitColor:'#dce8f8', voiceIndex:0 },
  { id:'sarah', name:'Sarah', gender:'female', skinBase:'#ffe4d0', skinShadow:'#e8b890', lipColor:'#e8707a', eyeColor:'#5b9bd5', hairColor:'#c84a6a', browColor:'#8a2a3a', outfitColor:'#9878c8', voiceIndex:0 },
  { id:'emma', name:'Emma', gender:'female', skinBase:'#fff0e0', skinShadow:'#f0d0b0', lipColor:'#f09090', eyeColor:'#40a880', hairColor:'#e8a030', browColor:'#b07820', outfitColor:'#f0a068', voiceIndex:5 },
  { id:'mike', name:'Mike', gender:'male',   skinBase:'#f5dcc8', skinShadow:'#d4a878', lipColor:'#c87070', eyeColor:'#4a7a9b', hairColor:'#303040', browColor:'#202028', outfitColor:'#4a5a7a', voiceIndex:2 },
  { id:'lisa', name:'Lisa', gender:'female', skinBase:'#ffeee0', skinShadow:'#e8c8a8', lipColor:'#e0687a', eyeColor:'#7a60c8', hairColor:'#701878', browColor:'#501060', outfitColor:'#d458b0', voiceIndex:3 },
  { id:'tom', name:'Tom', gender:'male',   skinBase:'#d8b888', skinShadow:'#b89060', lipColor:'#b8685a', eyeColor:'#507050', hairColor:'#1a1010', browColor:'#0a0808', outfitColor:'#4a5a4a', voiceIndex:1 },
];

export interface DigitalHumanHandle {
  startTalking: () => void; stopTalking: () => void;
  startListening: () => void; stopListening: () => void;
  setTalking: (v: boolean) => void; setListening: (v: boolean) => void;
  setCharacter: (c: CharacterConfig) => void; resetRotation: () => void;
  greet: () => void;
}
interface Props {
  character?: CharacterConfig; width?: number; height?: number;
  className?: string; talking?: boolean; listening?: boolean;
}

type IdleAction = 'none' | 'look_left' | 'look_right' | 'head_tilt' | 'double_blink' | 'smile_brief' | 'hair_touch' | 'body_bounce';
type ClickReaction = 'nod' | 'tilt' | 'wave' | 'surprise';

const DigitalHuman = forwardRef<DigitalHumanHandle, Props>(({
  character = CHARACTERS[0], width = 400, height = 450, className = '',
  talking: talkingProp, listening: listeningProp,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const charRef = useRef(character);
  const talkingRef = useRef(false);
  const listeningRef = useRef(false);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const vrmRef = useRef<VRM>();
  const headRef = useRef<THREE.Object3D>();
  const rArmRef = useRef<THREE.Object3D>();

  // Interaction state
  const rotY = useRef(0); const tgtY = useRef(0);
  const drag = useRef(false); const prevX = useRef(0); const inertia = useRef(0);
  const mouse = useRef({ x:.5, y:.5, active:false });

  // Animation state
  const blinkTimer = useRef(3+Math.random()*2); const blinkVal = useRef(0); const blinkPh = useRef<'o'|'c'|'p'>('o');
  const idleTimer = useRef(4+Math.random()*6); const idleAction = useRef<IdleAction>('none'); const idleT = useRef(0);
  const react = useRef<ClickReaction|null>(null); const reactT = useRef(0);
  const greetT = useRef(0);

  // Props sync
  if (talkingProp !== undefined) talkingRef.current = talkingProp;
  if (listeningProp !== undefined) listeningRef.current = listeningProp;
  charRef.current = character;

  useImperativeHandle(ref, () => ({
    startTalking(){ talkingRef.current=true; listeningRef.current=false; },
    stopTalking(){ talkingRef.current=false; },
    startListening(){ listeningRef.current=true; talkingRef.current=false; },
    stopListening(){ listeningRef.current=false; },
    setTalking(v){ talkingRef.current=v; if(v)listeningRef.current=false; },
    setListening(v){ listeningRef.current=v; if(v)talkingRef.current=false; },
    setCharacter(c){ charRef.current=c; if(c.vrmUrl||DEFAULT_VRM !== (charRef.current.vrmUrl||DEFAULT_VRM)) loadVrm(c.vrmUrl||DEFAULT_VRM); },
    resetRotation(){ tgtY.current=0; inertia.current=0; },
    greet(){ greetT.current=2.5; },
  }));

  const loadVrm = useCallback(async (url: string) => {
    const s = sceneRef.current; if (!s) return;
    const old = vrmRef.current; if (old) { s.remove(old.scene); VRMUtils.deepDispose(old.scene); }
    try {
      const l = new GLTFLoader(); l.register(p => new VRMLoaderPlugin(p));
      const g = await l.loadAsync(url); const v: VRM = g.userData.vrm;
      VRMUtils.rotateVRM0(v); v.scene.rotation.set(0,0,0); v.scene.position.set(0,0,0);
      s.add(v.scene); vrmRef.current = v;
      headRef.current = v.humanoid?.getBoneNode(VRMHumanBoneName.Head) ?? undefined;
      rArmRef.current = v.humanoid?.getBoneNode(VRMHumanBoneName.RightUpperArm) ?? undefined;
      rotY.current = 0; tgtY.current = 0;
    } catch(e){ console.error('VRM:', e); }
  }, []);

  // Mouse tracking
  const trackMouse = (cx: number, cy: number) => {
    const c = containerRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    mouse.current = { x: Math.max(0,Math.min(1,(cx-r.left)/r.width)), y: Math.max(0,Math.min(1,(cy-r.top)/r.height)), active: true };
  };
  const onPDown = useCallback((e: React.PointerEvent) => { drag.current=true; prevX.current=e.clientX; inertia.current=0; (e.target as HTMLElement).setPointerCapture(e.pointerId); }, []);
  const onPMove = useCallback((e: React.PointerEvent) => { trackMouse(e.clientX,e.clientY); if(!drag.current)return; const dx=e.clientX-prevX.current; prevX.current=e.clientX; tgtY.current+=dx*.008; inertia.current=dx*.5; }, []);
  const onPUp = useCallback((e: React.PointerEvent) => { drag.current=false; (e.target as HTMLElement).releasePointerCapture(e.pointerId); }, []);
  const onPLeave = useCallback(() => { drag.current=false; mouse.current.active=false; }, []);
  const onPEnter = useCallback((e: React.PointerEvent) => { trackMouse(e.clientX,e.clientY); }, []);
  const onClickReact = useCallback((e: React.MouseEvent) => {
    const c = containerRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const cx = (e.clientX-r.left)/r.width-.5, cy = (e.clientY-r.top)/r.height-.42;
    react.current = Math.abs(cx)<.15&&cy<0&&cy>-.3?'nod' : Math.abs(cx)<.2&&cy>-.1&&cy<.3?'wave' : Math.abs(cx)>.15?'tilt' : 'surprise';
    reactT.current = {nod:1.0,wave:1.3,tilt:1.2,surprise:1.0}[react.current];
    idleTimer.current = 6+Math.random()*5;
  }, []);

  // Init scene
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const dpr = Math.min(devicePixelRatio,2); cvs.width = width*dpr; cvs.height = height*dpr;

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a2e); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(25, width/height, .1, 20); camera.position.set(0,1.35,-1.4); camera.lookAt(0,1.35,0); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ canvas: cvs, alpha:true, antialias:true });
    renderer.setPixelRatio(dpr); renderer.setSize(width, height); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff,.6));
    const ml = new THREE.DirectionalLight(0xffffff,1.8); ml.position.set(2,3,3); scene.add(ml);
    const fl = new THREE.DirectionalLight(0xffeedd,.6); fl.position.set(-2,1,-1); scene.add(fl);
    const rl = new THREE.DirectionalLight(0xaaccff,.4); rl.position.set(0,2,-3); scene.add(rl);
    scene.add(new THREE.HemisphereLight(0x8eaaff,0x443322,.4));

    loadVrm(charRef.current.vrmUrl || DEFAULT_VRM);
    greetT.current = 2.5; // 进场打招呼

    // ════════════════════════════════════
    //  ANIMATE LOOP
    // ════════════════════════════════════
    let raf: number; const clock = new THREE.Clock();

    function loop() {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(),.1); const t = performance.now()/1000;
      const vrm = vrmRef.current; const head = headRef.current; const rArm = rArmRef.current;
      if (!vrm) { renderer.render(scene,camera); return; }
      const em = vrm.expressionManager;

      // ── Rot inertia ──
      if (!drag.current && Math.abs(inertia.current)>.00008) { tgtY.current+=inertia.current*dt; inertia.current*=.92; }
      const ty = tgtY.current; rotY.current += (ty-rotY.current)*(drag.current?.6:.08);
      vrm.scene.rotation.y = rotY.current;

      // ── Blink ──
      if (blinkPh.current==='o'){ blinkTimer.current-=dt; if(blinkTimer.current<=0)blinkPh.current='c'; }
      else if(blinkPh.current==='c'){ blinkVal.current=Math.min(1,blinkVal.current+dt*12); if(blinkVal.current>=1)blinkPh.current='p'; }
      else { blinkVal.current=Math.max(0,blinkVal.current-dt*8); if(blinkVal.current<=0){ blinkPh.current='o'; blinkTimer.current=3+Math.random()*2.5; } }

      // ── Idle action ──
      const busy = talkingRef.current || listeningRef.current || react.current || greetT.current>0;
      if (!busy) {
        idleTimer.current -= dt;
        if (idleTimer.current<=0 && idleAction.current==='none') {
          const acts: IdleAction[] = ['look_left','look_right','head_tilt','double_blink','smile_brief','hair_touch','body_bounce'];
          idleAction.current = acts[Math.floor(Math.random()*acts.length)]; idleT.current=0;
        }
        if (idleAction.current!=='none') {
          idleT.current += dt;
          applyIdle(vrm, head ?? null, idleAction.current, Math.min(1,idleT.current/1.0));
          if (idleT.current>1.5) { idleAction.current='none'; idleTimer.current=4+Math.random()*8; }
        }
      }

      // ── Gaze: head faces mouse ──
      if (head && mouse.current.active && !drag.current && !busy) {
        const gx = (mouse.current.x-.5)*.35; // 视线方向x
        const gy = (mouse.current.y-.4)*.15; // 视线方向y
        const or = head.userData.origRot || { x:head.rotation.x,y:head.rotation.y,z:head.rotation.z };
        if (!head.userData.origRot) head.userData.origRot = or;
        head.rotation.x += (or.x-gy-head.rotation.x)*.08;
        head.rotation.y += (or.y+gx-head.rotation.y)*.06;
      }

      // ── Head micro-motion (idle only) ──
      if (head && !busy && !drag.current) {
        const or = head.userData.origRot;
        if (or && !mouse.current.active) {
          head.rotation.x += (or.x+Math.sin(t*.5)*.015-head.rotation.x)*.1;
          head.rotation.y += (or.y+Math.sin(t*.35+.5)*.025-head.rotation.y)*.1;
          head.rotation.z += (or.z+Math.sin(t*.7)*.01-head.rotation.z)*.1;
        }
      }

      // ── Click reaction ──
      if (react.current) {
        reactT.current -= dt; const p = 1-Math.max(0,reactT.current/({nod:1,wave:1.3,tilt:1.2,surprise:1}[react.current]));
        applyReaction(vrm, head ?? null, rArm ?? null, react.current, Math.min(1,p));
        if (reactT.current<=0) react.current=null;
      }

      // ── Greeting ──
      if (greetT.current>0) {
        greetT.current -= dt; const p = 1-Math.max(0,greetT.current/2.5);
        em?.setValue(VRMExpressionPresetName.Happy, .6*Math.sin(p*Math.PI));
        if (rArm) { const or=rArm.userData.origRot||{x:rArm.rotation.x,y:rArm.rotation.y,z:rArm.rotation.z}; if(!rArm.userData.origRot)rArm.userData.origRot=or; rArm.rotation.z=or.z+Math.sin(p*20)*.5*(1-p); rArm.rotation.x=or.x-p*.6; }
      }

      // ── Breathe ──
      if (!busy) vrm.scene.position.y = Math.sin(t*1.2)*.003;

      // ── Talking ──
      if (talkingRef.current) {
        const mv = .3+Math.abs(Math.sin(t*12+Math.sin(t*2.5)*.5))*.7;
        em?.setValue(VRMExpressionPresetName.Aa, mv);
        const ac = t%.6; if(ac<.15)em?.setValue(VRMExpressionPresetName.Ih,.3); else if(ac<.3)em?.setValue(VRMExpressionPresetName.Ou,.2); else if(ac<.45)em?.setValue(VRMExpressionPresetName.Ee,.15);
        em?.setValue(VRMExpressionPresetName.Happy,.15);
        // talking body sway
        vrm.scene.position.y = Math.sin(t*3)*.005;
        if (head) { const or=head.userData.origRot; if(or) head.rotation.x += (or.x+Math.sin(t*2.5)*.04-head.rotation.x)*.1; }
      } else if (listeningRef.current) {
        em?.setValue(VRMExpressionPresetName.Aa,.08);
        em?.setValue(VRMExpressionPresetName.Happy,.35);
        em?.setValue(VRMExpressionPresetName.Surprised,.15);
      } else if (!busy) {
        // Reset expressions in idle
      }

      // ── Apply blink ──
      em?.setValue(VRMExpressionPresetName.Blink, blinkVal.current);

      vrm.update(dt);
      renderer.render(scene,camera);
    }
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); const v=vrmRef.current; if(v){ scene.remove(v.scene); VRMUtils.deepDispose(v.scene); } renderer.dispose(); };
  }, [width, height, loadVrm]);

  return (
    <div ref={containerRef} className={className} style={{ width,height,position:'relative',cursor:drag.current?'grabbing':'grab' }}
      onPointerEnter={onPEnter} onPointerMove={onPMove} onPointerDown={onPDown} onPointerUp={onPUp} onPointerLeave={onPLeave} onClick={onClickReact}>
      <canvas ref={canvasRef} style={{ width:'100%',height:'100%',display:'block',borderRadius:'16px',touchAction:'none' }} />
      <div style={{ position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',display:'flex',gap:8,zIndex:5 }}>
        <button onClick={e=>{e.stopPropagation();tgtY.current=0;inertia.current=0;}}
          style={{ background:'rgba(255,255,255,.12)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.2)',borderRadius:16,padding:'5px 12px',color:'#ddd',fontSize:11,cursor:'pointer' }}>🧭 回正</button>
        <button onClick={e=>{e.stopPropagation();greetT.current=2.5;}}
          style={{ background:'rgba(255,255,255,.12)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.2)',borderRadius:16,padding:'5px 12px',color:'#ddd',fontSize:11,cursor:'pointer' }}>👋 打招呼</button>
      </div>
      <div style={{ position:'absolute',bottom:8,left:'50%',transform:'translateX(-50%)',color:'rgba(255,255,255,.25)',fontSize:9,pointerEvents:'none' }}>拖拽旋转 · 点击互动</div>
    </div>
  );
});

// ══════════ 空闲小动作 ══════════
function applyIdle(vrm:VRM, head:THREE.Object3D|null, action:IdleAction, p:number) {
  const em = vrm.expressionManager; if (!em||!head) return;
  const e = p<.5?2*p*p:-1+(4-2*p)*p; // smoothstep
  const or = head.userData.origRot; const ox=or?.x||0, oy=or?.y||0, oz=or?.z||0;
  switch(action){
    case'look_left': head.rotation.y=oy+e*.3; break;
    case'look_right': head.rotation.y=oy-e*.3; break;
    case'head_tilt': head.rotation.z=oz+Math.sin(p*Math.PI)*.15; break;
    case'double_blink': em.setValue(VRMExpressionPresetName.Blink,Math.sin(p*12)>.6?.9:0); break;
    case'smile_brief': em.setValue(VRMExpressionPresetName.Happy,Math.sin(p*Math.PI)*.4); break;
    case'hair_touch': head.rotation.z=oz+Math.sin(p*Math.PI)*.1; head.rotation.x=ox+Math.sin(p*Math.PI)*.08; break;
    case'body_bounce': vrm.scene.position.y=Math.sin(p*Math.PI*2)*.015; break;
  }
}

// ══════════ 点击反应 ══════════
function applyReaction(vrm:VRM, head:THREE.Object3D|null, rArm:THREE.Object3D|null, action:ClickReaction, p:number) {
  const em = vrm.expressionManager; if (!em) return;
  const w = Math.sin(p*Math.PI);
  const ox = head?.userData.origRot?.x||0, oy = head?.userData.origRot?.y||0, oz = head?.userData.origRot?.z||0;
  switch(action){
    case'nod': if(head)head.rotation.x=ox+Math.sin(p*Math.PI*3)*.12*(1-p); em.setValue(VRMExpressionPresetName.Happy,w*.3); break;
    case'tilt': if(head){head.rotation.z=oz+Math.sin(p*Math.PI)*.2; head.rotation.x=ox+Math.sin(p*Math.PI)*.06;} em.setValue(VRMExpressionPresetName.Happy,w*.35); break;
    case'wave': if(rArm){const o=rArm.userData.origRot||{x:rArm.rotation.x,y:rArm.rotation.y,z:rArm.rotation.z}; if(!rArm.userData.origRot)rArm.userData.origRot=o; rArm.rotation.z=o.z+Math.sin(p*18)*.55*(1-p); rArm.rotation.x=o.x-p*.7;} em.setValue(VRMExpressionPresetName.Happy,.5*w); break;
    case'surprise': em.setValue(VRMExpressionPresetName.Surprised,w*.4); em.setValue(VRMExpressionPresetName.Aa,w*.15); break;
  }
}

DigitalHuman.displayName = 'DigitalHuman';
export default DigitalHuman;
