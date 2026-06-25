/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandMetric } from '../types';
import { 
  Hand, 
  Activity, 
  Eye, 
  Sliders, 
  Monitor, 
  Sparkles, 
  Loader2, 
  Layers, 
  Radio, 
  Crosshair 
} from 'lucide-react';

const HAND_COLORS = [
  { hex: '#00E5FF', name: 'Cyan', bg: 'bg-[#00E5FF]/10', border: 'border-[#00E5FF]', text: 'text-[#00E5FF]' },
  { hex: '#FFD700', name: 'Amber', bg: 'bg-[#FFD700]/10', border: 'border-[#FFD700]', text: 'text-[#FFD700]' },
  { hex: '#FF4081', name: 'Pink', bg: 'bg-[#FF4081]/10', border: 'border-[#FF4081]', text: 'text-[#FF4081]' },
  { hex: '#76FF03', name: 'Lime', bg: 'bg-[#76FF03]/10', border: 'border-[#76FF03]', text: 'text-[#76FF03]' },
  { hex: '#E040FB', name: 'Purple', bg: 'bg-[#E040FB]/10', border: 'border-[#E040FB]', text: 'text-[#E040FB]' },
  { hex: '#FF6E40', name: 'Coral', bg: 'bg-[#FF6E40]/10', border: 'border-[#FF6E40]', text: 'text-[#FF6E40]' }
];

const MultiHandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastUIUpdateTime = useRef<number>(0);

  // Settings State
  const [loading, setLoading] = useState(true);
  const [maxHands, setMaxHands] = useState<number>(4);
  const [showSkeletons, setShowSkeletons] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [showPalmGlow, setShowPalmGlow] = useState<boolean>(true);

  // Telemetry State
  const [trackedHands, setTrackedHands] = useState<HandMetric[]>([]);
  const [fps, setFps] = useState<number>(0);
  const frameCount = useRef<number>(0);
  const lastFpsTime = useRef<number>(performance.now());

  // Update MediaPipe option when maxHands slider changes
  useEffect(() => {
    if (handsRef.current) {
      handsRef.current.setOptions({ maxNumHands: maxHands });
    }
  }, [maxHands]);

  // Gesture Classification Heuristic
  const classifyGesture = useCallback((landmarks: any[]) => {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    const isIndexExt = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) > Math.hypot(indexPip.x - wrist.x, indexPip.y - wrist.y) * 1.15;
    const isMiddleExt = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) > Math.hypot(middlePip.x - wrist.x, middlePip.y - wrist.y) * 1.15;
    const isRingExt = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) > Math.hypot(ringPip.x - wrist.x, ringPip.y - wrist.y) * 1.15;
    const isPinkyExt = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) > Math.hypot(pinkyPip.x - wrist.x, pinkyPip.y - wrist.y) * 1.15;

    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

    if (pinchDist < 0.065) return { gesture: 'Pinching', pinchDist };
    if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) return { gesture: 'Fist', pinchDist };
    if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt) return { gesture: 'Open Palm', pinchDist };
    if (isIndexExt && isMiddleExt && !isRingExt && !isPinkyExt) return { gesture: 'Victory / Peace', pinchDist };
    if (isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) return { gesture: 'Pointing', pinchDist };
    if (!isIndexExt && !isMiddleExt && !isRingExt && isPinkyExt) return { gesture: 'Pinky Extended', pinchDist };

    return { gesture: 'Active Hand', pinchDist };
  }, []);

  // Main Tracking Setup
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !containerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const onResults = (results: any) => {
      setLoading(false);

      // FPS Calculation
      frameCount.current++;
      const now = performance.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / (now - lastFpsTime.current)));
        frameCount.current = 0;
        lastFpsTime.current = now;
      }

      // Responsive Canvas Resize
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Video Background (mirrored via CSS)
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // Dark Contrast Overlay
      ctx.fillStyle = 'rgba(18, 18, 18, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const detectedHands: HandMetric[] = [];

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const landmarks = results.multiHandLandmarks[i];
          const handednessInfo = results.multiHandedness ? results.multiHandedness[i] : null;
          const colorTheme = HAND_COLORS[i % HAND_COLORS.length];

          // Because camera is horizontally mirrored on canvas, MediaPipe Left/Right label is inverted visually
          let rawLabel = handednessInfo?.label || 'Unknown';
          let visualLabel = rawLabel === 'Left' ? 'Right' : rawLabel === 'Right' ? 'Left' : 'Unknown';
          let confScore = handednessInfo?.score ? Math.round(handednessInfo.score * 100) : 95;

          // Compute Palm Center (Average of Wrist, Index MCP, Pinky MCP)
          const wrist = landmarks[0];
          const indexMcp = landmarks[5];
          const pinkyMcp = landmarks[17];
          const palmCenter = {
            x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
            y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3
          };

          const { gesture, pinchDist } = classifyGesture(landmarks);

          detectedHands.push({
            id: i + 1,
            handedness: visualLabel,
            confidence: confScore,
            gesture,
            palmCenter,
            pinchDistance: Math.round(pinchDist * 100),
            color: colorTheme.hex,
            colorName: colorTheme.name
          });

          // Draw Palm Glow
          if (showPalmGlow) {
            ctx.beginPath();
            ctx.arc(palmCenter.x * canvas.width, palmCenter.y * canvas.height, 45, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(
              palmCenter.x * canvas.width,
              palmCenter.y * canvas.height,
              5,
              palmCenter.x * canvas.width,
              palmCenter.y * canvas.height,
              45
            );
            grad.addColorStop(0, `${colorTheme.hex}40`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fill();
          }

          // Draw Skeletons
          if (showSkeletons && window.drawConnectors) {
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
              color: colorTheme.hex,
              lineWidth: 3
            });
          }

          // Draw Landmarks
          if (showLandmarks && window.drawLandmarks) {
            window.drawLandmarks(ctx, landmarks, {
              color: '#FFFFFF',
              fillColor: colorTheme.hex,
              lineWidth: 1.5,
              radius: 4
            });
          }

          // Draw Palm Crosshair
          ctx.beginPath();
          ctx.arc(palmCenter.x * canvas.width, palmCenter.y * canvas.height, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = colorTheme.hex;
          ctx.fill();
        }
      }

      ctx.restore();

      // Throttle React UI State update to ~20 FPS (50ms) to maintain smooth canvas performance
      if (now - lastUIUpdateTime.current > 50) {
        lastUIUpdateTime.current = now;
        setTrackedHands(detectedHands);
      }
    };

    if (window.Hands) {
      handsRef.current = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      handsRef.current.setOptions({
        maxNumHands: maxHands,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      handsRef.current.onResults(onResults);

      if (window.Camera) {
        cameraRef.current = new window.Camera(video, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720
        });
        cameraRef.current.start();
      }
    }

    return () => {
      if (cameraRef.current) cameraRef.current.stop();
      if (handsRef.current) handsRef.current.close();
    };
  }, [classifyGesture, maxHands, showLandmarks, showPalmGlow, showSkeletons]);

  return (
    <div className="relative w-full h-screen bg-[#0A0A0A] overflow-hidden select-none font-roboto text-[#e3e3e3] flex flex-col">
      
      {/* MOBILE WARNING OVERLAY */}
      <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-8 text-center md:hidden">
        <Monitor className="w-16 h-16 text-[#00E5FF] mb-6 animate-pulse" />
        <h2 className="text-2xl font-bold text-white mb-3">Larger Display Needed</h2>
        <p className="text-gray-400 max-w-md text-base leading-relaxed mb-6">
          Multi-hand tracking requires webcam precision and screen space best experienced on a desktop or laptop browser.
        </p>
        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-gray-300">
          Please maximize window
        </div>
      </div>

      {/* TOP HUD BAR */}
      <header className="absolute top-0 inset-x-0 z-30 p-4 md:p-6 pointer-events-none flex items-center justify-between">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#161616]/90 border border-white/10 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl">
          <div className="p-2 bg-[#00E5FF]/20 text-[#00E5FF] rounded-xl">
            <Hand className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide text-white flex items-center gap-2">
              Multi-Hand Vision
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 rounded-full">
                Live
              </span>
            </h1>
            <p className="text-xs text-gray-400">Real-time MediaPipe Landmark Telemetry</p>
          </div>
        </div>

        {/* STATUS BADGES */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="bg-[#161616]/90 border border-white/10 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r border-white/10">
              <Activity className="w-4 h-4 text-[#00E5FF]" />
              <span className="text-xs font-mono text-gray-300 font-bold">{fps} FPS</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${trackedHands.length > 0 ? 'text-[#76FF03] animate-pulse' : 'text-gray-500'}`} />
              <span className="text-xs font-medium text-white">
                {trackedHands.length} / {maxHands} Hands
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CANVAS STAGE */}
      <main ref={containerRef} className="flex-1 relative w-full h-full">
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* LOADING STATE */}
        {loading && (
          <div className="absolute inset-0 z-40 bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-12 h-12 text-[#00E5FF] animate-spin" />
            <p className="text-sm font-mono tracking-widest text-gray-400 uppercase">
              Initializing Hand Tracking Neural Net...
            </p>
          </div>
        )}

        {/* NO HANDS DETECTED PROMPT */}
        {!loading && trackedHands.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="bg-black/60 border border-white/10 backdrop-blur-md px-6 py-4 rounded-3xl flex items-center gap-4 animate-fade-in shadow-2xl max-w-sm text-center">
              <Sparkles className="w-6 h-6 text-[#00E5FF] shrink-0 animate-bounce" />
              <p className="text-sm text-gray-200 font-medium">
                Hold up to <strong className="text-[#00E5FF] font-bold">{maxHands} hands</strong> clearly in front of the camera to begin telemetry.
              </p>
            </div>
          </div>
        )}

        {/* FLOATING HAND LABELS ON CANVAS */}
        {!loading && trackedHands.map((hand) => {
          // Invert X coordinate because canvas is mirrored horizontally
          const mirroredLeftPct = (1 - hand.palmCenter.x) * 100;
          const topPct = hand.palmCenter.y * 100;

          return (
            <div
              key={hand.id}
              className="absolute pointer-events-none transition-all duration-75 ease-out transform -translate-x-1/2 -translate-y-12 z-20"
              style={{ left: `${mirroredLeftPct}%`, top: `${topPct}%` }}
            >
              <div
                className="px-3 py-1.5 rounded-xl border backdrop-blur-md bg-black/80 shadow-2xl flex items-center gap-2 text-xs whitespace-nowrap"
                style={{ borderColor: hand.color }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: hand.color }} />
                <span className="font-bold text-white">#{hand.id} {hand.handedness}</span>
                <span className="text-gray-400 font-mono">({hand.confidence}%)</span>
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px] uppercase font-bold">
                  {hand.gesture}
                </span>
              </div>
            </div>
          );
        })}
      </main>

      {/* BOTTOM CONTROL & TELEMETRY PANEL */}
      <footer className="absolute bottom-0 inset-x-0 z-30 p-4 md:p-6 pointer-events-none flex flex-col gap-4">
        
        {/* TRACKED HAND cards GRID */}
        {trackedHands.length > 0 && (
          <div className="pointer-events-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-6xl mx-auto w-full">
            {trackedHands.map((hand) => (
              <div
                key={hand.id}
                className="bg-[#161616]/95 border border-white/10 backdrop-blur-md p-4 rounded-2xl shadow-xl transition-all hover:border-white/30 flex flex-col justify-between"
                style={{ borderLeftColor: hand.color, borderLeftWidth: '4px' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gray-400">HAND #{hand.id}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/5 text-white">
                      {hand.handedness}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#00E5FF] font-bold">{hand.confidence}%</span>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[11px] font-mono text-gray-300">
                      X: {Math.round((1 - hand.palmCenter.x) * 100)}% Y: {Math.round(hand.palmCenter.y * 100)}%
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider"
                    style={{ backgroundColor: `${hand.color}20`, color: hand.color }}
                  >
                    {hand.gesture}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONTROLS BAR */}
        <div className="pointer-events-auto max-w-3xl mx-auto w-full bg-[#161616]/90 border border-white/10 backdrop-blur-md p-3 md:p-4 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4">
          
          {/* MAX HANDS SELECTOR */}
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-[#00E5FF]" />
            <span className="text-xs font-mono uppercase text-gray-400 font-bold">Max Hands:</span>
            <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10">
              {[1, 2, 4, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => setMaxHands(num)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    maxHands === num
                      ? 'bg-[#00E5FF] text-black shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* VISUAL TOGGLES */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <button
              onClick={() => setShowSkeletons(!showSkeletons)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                showSkeletons
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-transparent border-white/5 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Skeletons
            </button>

            <button
              onClick={() => setShowLandmarks(!showLandmarks)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                showLandmarks
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-transparent border-white/5 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Landmarks
            </button>

            <button
              onClick={() => setShowPalmGlow(!showPalmGlow)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                showPalmGlow
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-transparent border-white/5 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Palm Glow
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MultiHandTracker;
