import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';

// Set Cubism Core URL before any Live2D loading
(window as any).LIVE2DCUBISMCORE_URL = `${import.meta.env.BASE_URL}live2dcubismcore.min.js`;

export interface Live2DHandle {
  setTalking: (v: boolean) => void;
  setListening: (v: boolean) => void;
  setCharacter: (c: any) => void;
  playExpression: (name: string) => void;
  playMotion: (name: string) => void;
  toggleGlasses: () => void;
}

interface Props {
  width?: number;
  height?: number;
  className?: string;
  talking?: boolean;
  listening?: boolean;
}

const MODEL_PATH = `${import.meta.env.BASE_URL}models/xiaoyue/xiaoyue.model3.json`;

// Available expressions from the model
const EXPRESSIONS = [
  '脸红', '星星眼', '爱心眼', '晕晕眼', '黑脸',
  '眼镜', '精灵耳', '丸子头', '前倾',
  '右手势1', '右手势2', '左手势1', '左手势2', '加载中',
];

const Live2DCharacter = forwardRef<Live2DHandle, Props>(({
  width = 320, height = 380, className = '',
  talking: talkingProp, listening: listeningProp,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const talkingRef = useRef(false);
  const listeningRef = useRef(false);
  const glassesRef = useRef(true); // Start with glasses on
  const loadedRef = useRef(false);

  if (talkingProp !== undefined) talkingRef.current = talkingProp;
  if (listeningProp !== undefined) listeningRef.current = listeningProp;

  useImperativeHandle(ref, () => ({
    setTalking: (v) => { talkingRef.current = v; },
    setListening: (v) => { listeningRef.current = v; },
    setCharacter: () => {}, // no-op for Live2D
    playExpression: (name) => {
      const m = modelRef.current;
      if (m && m.internalModel) {
        try { m.internalModel.motionManager.expressionManager?.setExpression(name); } catch {}
      }
    },
    playMotion: (name) => {
      const m = modelRef.current;
      if (m) { try { m.motion(name); } catch {} }
    },
    toggleGlasses: () => {
      glassesRef.current = !glassesRef.current;
      const m = modelRef.current;
      if (m && m.internalModel) {
        try { m.internalModel.motionManager.expressionManager?.setExpression(glassesRef.current ? '眼镜' : '眼镜off'); } catch {}
      }
    },
  }));

  // ── Init PixiJS + Live2D ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loadedRef.current) return;
    loadedRef.current = true;

    let app: PIXI.Application;
    let disposed = false;

    (async () => {
      try {
        // Create Pixi application
        app = new PIXI.Application({
          view: canvas,
          width, height,
          backgroundAlpha: 0,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
        } as any);
        appRef.current = app;

        // Background
        const bg = new PIXI.Graphics();
        bg.beginFill(0x1a1a2e);
        bg.drawRect(0, 0, width, height);
        bg.endFill();
        app.stage.addChild(bg);

        if (disposed) return;

        // Load model
        const model = await Live2DModel.from(MODEL_PATH);
        if (disposed) { model.destroy(); return; }
        modelRef.current = model;

        // Position: center in canvas
        model.anchor.set(0.5, 0.1);
        model.x = width / 2;
        model.y = 0;
        model.scale.set(Math.min(width / 350, height / 500) * 0.85);

        app.stage.addChild(model as any);

        // Start idle animation loop
        let idleTimer: number;
        const playIdle = () => {
          if (disposed || !modelRef.current) return;
          try {
            modelRef.current.motion('待机动画124');
          } catch {}
          idleTimer = window.setTimeout(playIdle, 5000);
        };
        playIdle();

        // Blush on load
        setTimeout(() => {
          try { model.internalModel.motionManager.expressionManager?.setExpression('脸红'); } catch {}
        }, 500);

        // ── Animation ticker ──
        app.ticker.add(() => {
          if (disposed || !model) return;
          const t = performance.now() / 1000;

          // Breathing + slight movement
          model.y = Math.sin(t * 1.2) * 3;
          model.rotation = Math.sin(t * 0.5) * 0.02;

          // Talking: play mouth open expression
          if (talkingRef.current) {
            const mouthCycle = Math.sin(t * 10 + Math.sin(t * 2.5) * 0.5);
            if (mouthCycle > 0.3) {
              try {
                // Mix expressions for talking effect
                // (This is a simplified talking effect since we don't have lip-sync data)
              } catch {}
            }
          }
        });

      } catch (e) {
        console.error('Live2D init error:', e);
      }
    })();

    return () => {
      disposed = true;
      if (app) {
        try { app.destroy(true, { children: true }); } catch {}
      }
      appRef.current = null;
      modelRef.current = null;
      loadedRef.current = false;
    };
  }, [width, height]);

  return (
    <div ref={containerRef} className={className} style={{ width, height, position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: '16px' }} />
    </div>
  );
});

Live2DCharacter.displayName = 'Live2DCharacter';
export default Live2DCharacter;
