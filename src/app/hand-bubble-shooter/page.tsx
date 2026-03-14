"use client";

import React, { useEffect, useRef, useState } from "react";
import Head from "next/head";

// --- Types & Constants Constants ---
const BUBBLE_RADIUS = 25;
const BUBBLE_DIAM = BUBBLE_RADIUS * 2;
const COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#f97316",
]; // Red, Blue, Green, Yellow, Purple, Orange
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);

type Point = { x: number; y: number };
type Bubble = {
  x: number;
  y: number;
  color: string;
  gridR: number;
  gridC: number;
  active: boolean;
};
type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  active: boolean;
};

// Game state to hold inside a ref to avoid React render cycle delays
class GameState {
  bubbles: Bubble[] = [];
  projectile: Projectile | null = null;
  score: number = 0;
  currentColor: string = COLORS[0];

  // Slingshot
  slingshotAnchor: Point = { x: 0, y: 0 };
  isPulling: boolean = false;
  pullPos: Point = { x: 0, y: 0 };

  // Hand tracking
  handPos: Point = { x: 0, y: 0 };
  isPinching: boolean = false;
  pinchStartDistToAnchor: number = 0;

  // Hover color
  hoverColorIndex: number = -1;
  hoverStartTime: number = 0;

  width: number = 0;
  height: number = 0;
  gridOffsetX: number = 0;
}

export default function HandBubbleShooter() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [scoreUI, setScoreUI] = useState(0);
  const [currentColorUI, setCurrentColorUI] = useState(COLORS[0]);
  const [hoverColorIndexUI, setHoverColorIndexUI] = useState(-1);
  const [hoverProgressUI, setHoverProgressUI] = useState(0);
  const [showHowToPlay, setShowHowToPlay] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(new GameState());
  const requestRef = useRef<number>(0);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // Initialize background music
  useEffect(() => {
    bgmRef.current = new Audio("/backsound.mp3");
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.4;
    
    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.src = "";
      }
    };
  }, []);

  const startGame = () => {
    setShowHowToPlay(false);
    if (bgmRef.current) {
      bgmRef.current.play().catch(e => console.log("Audio play prevented:", e));
    }
  };

  // Load MediaPipe scripts dynamically
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    const initMediaPipe = async () => {
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
        );
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
        );

        // Wait for objects to be available
        const checkReady = setInterval(() => {
          if (window.Hands && window.Camera) {
            clearInterval(checkReady);
            setupMediaPipe();
          }
        }, 100);
      } catch (err) {
        console.error("Failed to load MediaPipe scripts", err);
      }
    };

    initMediaPipe();

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const setupMediaPipe = () => {
    const videoResult = videoRef.current;
    if (!videoResult) return;

    const hands = new window.Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(onResults);

    const camera = new window.Camera(videoResult, {
      onFrame: async () => {
        await hands.send({ image: videoResult });
      },
      width: 1280,
      height: 720,
    });
    camera.start();

    // Init game grid
    initGrid();
  };

  const initGrid = () => {
    const st = stateRef.current;
    if (!canvasRef.current) return;
    st.width = canvasRef.current.width = window.innerWidth;
    st.height = canvasRef.current.height = window.innerHeight;

    st.slingshotAnchor = { x: st.width / 2, y: st.height - 250 };

    const cols = Math.floor(st.width / BUBBLE_DIAM) - 1;
    st.gridOffsetX = (st.width - cols * BUBBLE_DIAM) / 2;

    st.bubbles = [];
    for (let r = 0; r < 5; r++) {
      const rowCols = r % 2 === 0 ? cols : cols - 1;
      for (let c = 0; c < rowCols; c++) {
        const x = getGridX(r, c, st.gridOffsetX);
        const y = getGridY(r);
        st.bubbles.push({
          x,
          y,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          gridR: r,
          gridC: c,
          active: true,
        });
      }
    }

    setIsModelLoaded(true);
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const getGridX = (r: number, c: number, offsetX: number) => {
    return offsetX + c * BUBBLE_DIAM + (r % 2 !== 0 ? BUBBLE_RADIUS : 0);
  };
  const getGridY = (r: number) => {
    return BUBBLE_RADIUS + r * ROW_HEIGHT;
  };

  const getGridCoord = (x: number, y: number, offsetX: number) => {
    const r = Math.round((y - BUBBLE_RADIUS) / ROW_HEIGHT);
    const rowOffset = r % 2 !== 0 ? BUBBLE_RADIUS : 0;
    const c = Math.round((x - offsetX - rowOffset) / BUBBLE_DIAM);
    return { r, c };
  };

  const onResults = (results: any) => {
    const st = stateRef.current;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      // Map mirrored coordinates (x is inverted)
      const hx = (1 - indexTip.x) * st.width;
      const hy = indexTip.y * st.height;
      const tx = (1 - thumbTip.x) * st.width;
      const ty = thumbTip.y * st.height;

      st.handPos = { x: hx, y: hy };

      // Pinch detection
      const dist = Math.hypot(hx - tx, hy - ty);
      const isPinching = dist < 50; // Threshold for pinch in pixel space

      // Handle UI color hover logic
      let hoveringPalette = false;
      const paletteY = st.height - 80;
      const paletteW = 60 * COLORS.length;
      const paletteX = st.width / 2 - paletteW / 2;

      if (
        !isPinching &&
        hy > paletteY - 20 &&
        hx > paletteX &&
        hx < paletteX + paletteW
      ) {
        const colorIdx = Math.floor((hx - paletteX) / 60);
        if (colorIdx >= 0 && colorIdx < COLORS.length) {
          hoveringPalette = true;
          if (st.hoverColorIndex !== colorIdx) {
            st.hoverColorIndex = colorIdx;
            st.hoverStartTime = performance.now();
          } else {
            const progress = (performance.now() - st.hoverStartTime) / 500; // 0.5s to select
            setHoverProgressUI(Math.min(progress, 1));
            setHoverColorIndexUI(colorIdx);

            if (progress >= 1) {
              st.currentColor = COLORS[colorIdx];
              setCurrentColorUI(st.currentColor);
              st.hoverColorIndex = -1; // reset
            }
          }
        }
      }

      if (!hoveringPalette) {
        st.hoverColorIndex = -1;
        setHoverColorIndexUI(-1);
      }

      // Handle Slingshot Dragging
      if (isPinching && !st.isPinching) {
        // Just started pinching
        const distToAnchor = Math.hypot(
          hx - st.slingshotAnchor.x,
          hy - st.slingshotAnchor.y,
        );
        if (distToAnchor < 100) {
          st.isPulling = true;
          st.pullPos = { x: hx, y: hy };
        }
      } else if (isPinching && st.isPulling) {
        // Continuing pull
        st.pullPos = { x: hx, y: hy };
      } else if (!isPinching && st.isPinching && st.isPulling) {
        // Released pinch
        shootProjectile();
        st.isPulling = false;
      }

      st.isPinching = isPinching;
    } else {
      st.isPinching = false;
      st.isPulling = false;
    }
  };

  const shootProjectile = () => {
    const st = stateRef.current;
    if (st.projectile) return; // Already shooting

    const dx = st.pullPos.x - st.slingshotAnchor.x;
    const dy = st.pullPos.y - st.slingshotAnchor.y;

    // Only shoot if pulled downwards
    if (dy > 20) {
      // Pull down means trajectory goes UP (negative vy)
      // Velocity proportional to pull distance
      const coeff = -0.15; // Invert explicitly to go up
      st.projectile = {
        x: st.slingshotAnchor.x,
        y: st.slingshotAnchor.y,
        vx: dx * coeff,
        vy: dy * -Math.abs(coeff), // ensuring it always goes up
        color: st.currentColor,
        active: true,
      };
    }
  };

  const gameLoop = () => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const update = () => {
    const st = stateRef.current;

    // Resize handling (rudimentary check context)
    if (
      canvasRef.current &&
      (canvasRef.current.width !== window.innerWidth ||
        canvasRef.current.height !== window.innerHeight)
    ) {
      st.width = canvasRef.current.width = window.innerWidth;
      st.height = canvasRef.current.height = window.innerHeight;
      st.slingshotAnchor = { x: st.width / 2, y: st.height - 250 };
      st.gridOffsetX =
        (st.width - (Math.floor(st.width / BUBBLE_DIAM) - 1) * BUBBLE_DIAM) / 2;
    }

    if (st.projectile) {
      const p = st.projectile;
      p.x += p.vx;
      p.y += p.vy;

      // Wall bounce
      if (p.x - BUBBLE_RADIUS < 0) {
        p.x = BUBBLE_RADIUS;
        p.vx *= -1;
      } else if (p.x + BUBBLE_RADIUS > st.width) {
        p.x = st.width - BUBBLE_RADIUS;
        p.vx *= -1;
      }

      // Snapping logic
      let snapped = false;

      // Hit ceiling
      if (p.y - BUBBLE_RADIUS <= 0) {
        snapped = true;
      }

      // Hit other bubbles
      if (!snapped) {
        for (const b of st.bubbles) {
          const dist = Math.hypot(p.x - b.x, p.y - b.y);
          if (dist < BUBBLE_DIAM - 2) {
            snapped = true;
            break;
          }
        }
      }

      if (snapped) {
        snapProjectile();
      }
    }
  };

  const snapProjectile = () => {
    const st = stateRef.current;
    const p = st.projectile;
    if (!p) return;

    // Find nearest grid position
    let gridPos = getGridCoord(p.x, p.y, st.gridOffsetX);

    // Ensure r >= 0
    if (gridPos.r < 0) gridPos.r = 0;

    // Prevent overlapping an existing bubble directly (simple fallback)
    let isOccupied = st.bubbles.some(
      (b) => b.gridR === gridPos.r && b.gridC === gridPos.c,
    );
    if (isOccupied) {
      // Find empty neighbor closest to p
      const neighbors = getNeighbors(gridPos.r, gridPos.c);
      let bestDist = Infinity;
      let bestNeighbor = gridPos;
      for (const n of neighbors) {
        if (!st.bubbles.some((b) => b.gridR === n.r && b.gridC === n.c)) {
          const nx = getGridX(n.r, n.c, st.gridOffsetX);
          const ny = getGridY(n.r);
          const d = Math.hypot(p.x - nx, p.y - ny);
          if (d < bestDist) {
            bestDist = d;
            bestNeighbor = n;
          }
        }
      }
      gridPos = bestNeighbor;
    }

    const newBubble: Bubble = {
      x: getGridX(gridPos.r, gridPos.c, st.gridOffsetX),
      y: getGridY(gridPos.r),
      color: p.color,
      gridR: gridPos.r,
      gridC: gridPos.c,
      active: true,
    };

    st.bubbles.push(newBubble);
    st.projectile = null;

    // Match-3 Check
    checkMatches(newBubble);
  };

  const getNeighbors = (r: number, c: number) => {
    const isOdd = r % 2 !== 0;
    return [
      { r, c: c - 1 },
      { r, c: c + 1 }, // left, right
      { r: r - 1, c: isOdd ? c : c - 1 },
      { r: r - 1, c: isOdd ? c + 1 : c }, // top-left, top-right
      { r: r + 1, c: isOdd ? c : c - 1 },
      { r: r + 1, c: isOdd ? c + 1 : c }, // bottom-left, bottom-right
    ].filter((n) => n.r >= 0 && n.c >= 0);
  };

  const checkMatches = (startBubble: Bubble) => {
    const st = stateRef.current;

    // 1. Flood fill for same color
    const matchGroup = new Set<Bubble>();
    const queue = [startBubble];
    matchGroup.add(startBubble);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = getNeighbors(cur.gridR, cur.gridC);

      for (const n of neighbors) {
        const neighborBubble = st.bubbles.find(
          (b) => b.gridR === n.r && b.gridC === n.c,
        );
        if (
          neighborBubble &&
          neighborBubble.color === cur.color &&
          !matchGroup.has(neighborBubble)
        ) {
          matchGroup.add(neighborBubble);
          queue.push(neighborBubble);
        }
      }
    }

    if (matchGroup.size >= 3) {
      // Remove matched bubbles
      st.bubbles = st.bubbles.filter((b) => !matchGroup.has(b));
      st.score += matchGroup.size * 10;
      setScoreUI(st.score);

      // 2. Check for unanchored bubbles (Gravity)
      checkGravity();
    }
  };

  const checkGravity = () => {
    const st = stateRef.current;

    // Flood fill from ceiling (row 0) to find anchored bubbles
    const anchored = new Set<Bubble>();
    const queue = st.bubbles.filter((b) => b.gridR === 0);

    for (const topB of queue) anchored.add(topB);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = getNeighbors(cur.gridR, cur.gridC);

      for (const n of neighbors) {
        const neighborBubble = st.bubbles.find(
          (b) => b.gridR === n.r && b.gridC === n.c,
        );
        if (neighborBubble && !anchored.has(neighborBubble)) {
          anchored.add(neighborBubble);
          queue.push(neighborBubble);
        }
      }
    }

    const unanchoredCount = st.bubbles.length - anchored.size;
    if (unanchoredCount > 0) {
      st.bubbles = st.bubbles.filter((b) => anchored.has(b));
      st.score += unanchoredCount * 20; // Bonus for dropped bubbles
      setScoreUI(st.score);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const st = stateRef.current;
    ctx.clearRect(0, 0, st.width, st.height);

    // Draw Bubbles
    for (const b of st.bubbles) {
      drawBubble(ctx, b.x, b.y, b.color);
    }

    // Draw Projectile
    if (st.projectile) {
      drawBubble(ctx, st.projectile.x, st.projectile.y, st.projectile.color);
    }

    // Draw Slingshot Anchor
    ctx.beginPath();
    ctx.arc(st.slingshotAnchor.x, st.slingshotAnchor.y, 40, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Loaded Bubble at anchor (if not shooting)
    if (!st.projectile && !st.isPulling) {
      drawBubble(
        ctx,
        st.slingshotAnchor.x,
        st.slingshotAnchor.y,
        st.currentColor,
      );
    }

    // Draw Pulling & Trajectory
    if (st.isPulling && !st.projectile) {
      const dx = st.pullPos.x - st.slingshotAnchor.x;
      const dy = st.pullPos.y - st.slingshotAnchor.y;

      // Clamp pull to 250px max
      const dist = Math.hypot(dx, dy);
      let px = st.pullPos.x;
      let py = st.pullPos.y;
      if (dist > 250) {
        px = st.slingshotAnchor.x + (dx / dist) * 250;
        py = st.slingshotAnchor.y + (dy / dist) * 250;
      }

      // Constraints: we only shoot UPwards, meaning pull must be DOWNwards (py > anchor.y).
      if (py > st.slingshotAnchor.y) {
        // Draw the held bubble
        drawBubble(ctx, px, py, st.currentColor);

        // Draw rubber band
        ctx.beginPath();
        ctx.moveTo(st.slingshotAnchor.x - 20, st.slingshotAnchor.y);
        ctx.lineTo(px, py);
        ctx.lineTo(st.slingshotAnchor.x + 20, st.slingshotAnchor.y);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw trajectory (dashed opposite direction)
        const trajDx = st.slingshotAnchor.x - px;
        const trajDy = st.slingshotAnchor.y - py;

        ctx.beginPath();
        ctx.setLineDash([10, 15]);
        ctx.moveTo(st.slingshotAnchor.x, st.slingshotAnchor.y);
        ctx.lineTo(
          st.slingshotAnchor.x + trajDx * 3,
          st.slingshotAnchor.y + trajDy * 3,
        );
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // If pulling UP, just show it at anchor
        drawBubble(
          ctx,
          st.slingshotAnchor.x,
          st.slingshotAnchor.y,
          st.currentColor,
        );
      }
    }

    // Draw Hand Cursor
    if (st.handPos.x && st.handPos.y) {
      ctx.beginPath();
      ctx.arc(st.handPos.x, st.handPos.y, 15, 0, Math.PI * 2);
      ctx.fillStyle = st.isPinching
        ? "rgba(255,50,50,0.8)"
        : "rgba(255,255,255,0.8)";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const drawBubble = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ) => {
    ctx.beginPath();
    ctx.arc(x, y, BUBBLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner glow / specular highlight
    ctx.beginPath();
    ctx.arc(x - 8, y - 8, BUBBLE_RADIUS / 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(x, y, BUBBLE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      <Head>
        <title>AR Bubble Shooter</title>
      </Head>

      {/* Video Feed Layer */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1] opacity-60"
        playsInline
      />

      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {/* Loading Screen */}
        {!isModelLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md">
            <div className="text-white text-2xl font-bold tracking-widest animate-pulse">
              LOADING MEDIAPIPE AI...
            </div>
            <p className="text-white/70 mt-4">Please enable your camera.</p>
          </div>
        )}

        {/* Score Panel */}
        <div className="absolute top-6 left-6 px-6 py-4 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-xl">
          <div className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-1">
            Score
          </div>
          <div className="text-white text-4xl font-bold">{scoreUI}</div>
        </div>

        {/* Color Palette Panel */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 bg-white/10 backdrop-blur-xl rounded-full border border-white/20 shadow-2xl flex gap-4 pointer-events-auto items-center">
          {COLORS.map((col, i) => (
            <div key={i} className="relative">
              <div
                className={`w-12 h-12 rounded-full border-4 transition-all duration-300 ${currentColorUI === col ? "border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.8)]" : "border-transparent scale-100 opacity-80"}`}
                style={{ backgroundColor: col }}
              />
              {/* Hover Progress Ring */}
              {hoverColorIndexUI === i && (
                <svg className="absolute -top-1 -left-1 w-14 h-14 -rotate-90 pointer-events-none">
                  <circle
                    cx="28"
                    cy="28"
                    r="26"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    strokeDasharray="163" // 2 * PI * r
                    strokeDashoffset={163 * (1 - hoverProgressUI)}
                    className="transition-all duration-75"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
        {/* Help Button (when modal is closed) */}
        {!showHowToPlay && (
          <button
            onClick={() => setShowHowToPlay(true)}
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 backdrop-blur-lg rounded-full border border-white/20 shadow-xl text-white font-bold flex items-center justify-center pointer-events-auto hover:bg-white/20 transition z-30"
            aria-label="Cara Bermain"
          >
            ?
          </button>
        )}

        {/* Instructions Modal */}
        {showHowToPlay && (
          <div className="absolute inset-0 flex items-center justify-center z-50 p-4 pointer-events-auto bg-black/40 backdrop-blur-sm">
            <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 md:p-8 max-w-sm w-full">
              <button
                onClick={startGame}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
              >
                ✕
              </button>
              <h3 className="text-white text-xl md:text-2xl font-bold mb-4">
                Cara Bermain
              </h3>
              <ul className="text-white/80 space-y-4 list-none text-sm md:text-base">
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold">1</span>{" "}
                  <span>
                    <strong>Jepit</strong> (telunjuk & jempol) di dekat
                    lingkaran ketapel untuk mengambil gelembung.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold">2</span>{" "}
                  <span>
                    <strong>Tarik KE BAWAH</strong> untuk membidik ke atas.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold">3</span>{" "}
                  <span>
                    <strong>Lepaskan jepitan</strong> untuk menembak.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold">4</span>{" "}
                  <span>
                    <strong>Arahkan tangan</strong> di atas warna di bawah
                    selama 0.5 detik untuk berganti warna.
                  </span>
                </li>
              </ul>
              <button
                onClick={startGame}
                className="mt-6 w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition shadow-lg"
              >
                Mengerti!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
