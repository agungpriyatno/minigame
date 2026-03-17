"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Konstanta Game sesuai PRD
const WINNING_SCORE = 5;
const BALL_INITIAL_SPEED = 10;
const SPEED_INCREMENT = 0.4;
const MAX_SPEED = 25;
const SMASH_SPEED = 45; // Kecepatan smash
const HEAD_RADIUS = 45;
const HAND_RADIUS = 45;
const BALL_RADIUS = 35;

type UIState = "LOADING" | "START" | "COUNTDOWN" | "PLAYING" | "END";

interface GamePoint {
  x: number;
  y: number;
}

interface ProcessedPose {
  head: GamePoint | null;
  leftWrist: GamePoint | null;
  rightWrist: GamePoint | null;
  centerX: number;
}

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

interface GameStateRef {
  status: UIState;
  ball: BallState;
  scores: { left: number; right: number };
  poses: ProcessedPose[];
  lastBounceTime: number;
  // Smash tracking
  lastTouchSide: "LEFT" | "RIGHT" | null;
  consecutiveTouches: number;
  isSmash: boolean;
}

export default function PosePongGame() {
  // State UI
  const [uiState, setUiState] = useState<UIState>("LOADING");
  const [scores, setScores] = useState({ left: 0, right: 0 });
  const [countdown, setCountdown] = useState<number | string>(3);
  const [winner, setWinner] = useState("");
  const [statusText, setStatusText] = useState("Memuat library AI...");
  const [playerCount, setPlayerCount] = useState(0);
  const [smashFlash, setSmashFlash] = useState(false);

  // Refs DOM & Game State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);

  // State Game Mutable (Tidak menggunakan useState untuk menghindari re-render yang memengaruhi FPS)
  const gameState = useRef<GameStateRef>({
    status: "LOADING",
    ball: {
      x: typeof window !== "undefined" ? window.innerWidth / 2 : 640,
      y: typeof window !== "undefined" ? window.innerHeight / 2 : 360,
      vx: 0,
      vy: 0,
      speed: BALL_INITIAL_SPEED,
    },
    scores: { left: 0, right: 0 },
    poses: [],
    lastBounceTime: 0,
    lastTouchSide: null,
    consecutiveTouches: 0,
    isSmash: false,
  });

  const updateUiState = useCallback((newState: UIState) => {
    gameState.current.status = newState;
    setUiState(newState);
  }, []);

  const updateScores = useCallback((left: number, right: number) => {
    gameState.current.scores = { left, right };
    setScores({ left, right });
  }, []);

  const handleResize = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  const resetBall = useCallback((stationary = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameState.current.ball = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: 0,
      vy: 0,
      speed: BALL_INITIAL_SPEED,
    };
    if (stationary) {
      // Keep stationary
    }
  }, []);

  const launchBall = useCallback(() => {
    const angle =
      (Math.random() * Math.PI) / 2 -
      Math.PI / 4 +
      (Math.random() > 0.5 ? 0 : Math.PI);
    gameState.current.ball.vx = Math.cos(angle) * BALL_INITIAL_SPEED;
    gameState.current.ball.vy = Math.sin(angle) * BALL_INITIAL_SPEED;
  }, []);

  const startRound = useCallback(() => {
    updateUiState("COUNTDOWN");
    resetBall(true); // Posisi tengah, diam
    let count = 3;
    setCountdown(count);

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown("GO!");
      } else {
        clearInterval(interval);
        launchBall();
        updateUiState("PLAYING");
      }
    }, 1000);
  }, [updateUiState, resetBall, launchBall]);

  const startGame = useCallback(() => {
    updateScores(0, 0);
    startRound();
  }, [updateScores, startRound]);

  // Handle Score & Win Condition
  const handleGoal = useCallback(
    (side: "left" | "right") => {
      const currentScores = gameState.current.scores;
      const newScores = { ...currentScores };
      newScores[side] += 1;

      // Reset smash state on goal
      gameState.current.isSmash = false;
      gameState.current.lastTouchSide = null;
      gameState.current.consecutiveTouches = 0;

      updateScores(newScores.left, newScores.right);

      if (newScores.left >= WINNING_SCORE) {
        setWinner("Pemain Kiri (Cyan)");
        updateUiState("END");
      } else if (newScores.right >= WINNING_SCORE) {
        setWinner("Pemain Kanan (Red)");
        updateUiState("END");
      } else {
        startRound();
      }
    },
    [updateScores, updateUiState, startRound],
  );

  // --- GAME LOOP & FISIKA ---
  const gameLoop = useCallback(
    function loop() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const video = videoRef.current;

      if (
        canvas &&
        ctx &&
        video &&
        poseLandmarkerRef.current &&
        video.readyState >= 2
      ) {
        // 1. Deteksi Pose MediaPipe
        const startTimeMs = performance.now();
        if (lastVideoTimeRef.current !== video.currentTime && !video.paused) {
          lastVideoTimeRef.current = video.currentTime;
          const results = poseLandmarkerRef.current.detectForVideo(
            video,
            startTimeMs,
          );

          // Proses Landmark & Mirroring
          if (results.landmarks) {
            const processedPoses: ProcessedPose[] = results.landmarks.map(
              (pose: NormalizedLandmark[]) => {
                // Index penting: 0 (Hidung), 15 (Pergelangan Kiri), 16 (Pergelangan Kanan)
                const getPoint = (index: number): GamePoint | null => {
                  const landmark = pose[index];
                  if (
                    !landmark ||
                    (landmark.visibility !== undefined &&
                      landmark.visibility < 0.5)
                  )
                    return null;
                  // Mirror X axis karena video ditampilkan mirrored
                  return {
                    x: (1 - landmark.x) * canvas.width,
                    y: landmark.y * canvas.height,
                  };
                };

                const head = getPoint(0);
                return {
                  head: head,
                  leftWrist: getPoint(15),
                  rightWrist: getPoint(16),
                  centerX: head ? head.x : canvas.width / 2,
                };
              },
            );

            // Urutkan berdasarkan X untuk menentukan pemain Kiri (Green) dan Kanan (Blue)
            processedPoses.sort((a, b) => a.centerX - b.centerX);
            gameState.current.poses = processedPoses;

            if (playerCount !== processedPoses.length) {
              setPlayerCount(processedPoses.length);
            }
          }
        }

        // 2. Fisika Game (Hanya jika sedang PLAYING)
        if (gameState.current.status === "PLAYING") {
          const ball = gameState.current.ball;
          ball.x += ball.vx;
          ball.y += ball.vy;

          // Pantulan Atas/Bawah
          if (ball.y - BALL_RADIUS <= 0) {
            ball.y = BALL_RADIUS;
            ball.vy *= -1;
          } else if (ball.y + BALL_RADIUS >= canvas.height) {
            ball.y = canvas.height - BALL_RADIUS;
            ball.vy *= -1;
          }

          // Cek Gawang (Kiri/Kanan)
          if (ball.x < 0) {
            // Gol untuk Kanan
            handleGoal("right");
          } else if (ball.x > canvas.width) {
            // Gol untuk Kiri
            handleGoal("left");
          }

          // Deteksi Tabrakan dengan Pemain (Pose)
          const now = performance.now();
          if (now - gameState.current.lastBounceTime > 200) {
            let bounced = false;

            gameState.current.poses.forEach((pose, poseIndex) => {
              if (bounced) return;

              const points = [
                { point: pose.head, radius: HEAD_RADIUS },
                { point: pose.leftWrist, radius: HAND_RADIUS },
                { point: pose.rightWrist, radius: HAND_RADIUS },
              ];

              // Tentukan sisi pemain: index 0 = LEFT, index 1 = RIGHT
              const touchSide: "LEFT" | "RIGHT" = poseIndex === 0 ? "LEFT" : "RIGHT";

              points.forEach(({ point, radius }) => {
                if (bounced || !point) return;

                const dx = ball.x - point.x;
                const dy = ball.y - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < BALL_RADIUS + radius) {
                  const nx = dx / distance;
                  const ny = dy / distance;

                  // --- SMASH LOGIC ---
                  const gs = gameState.current;
                  let launchSpeed: number;

                  if (gs.lastTouchSide === touchSide) {
                    // Sentuhan ke-2 oleh pemain yang sama → SMASH!
                    gs.consecutiveTouches += 1;
                    if (gs.consecutiveTouches >= 2) {
                      gs.isSmash = true;
                      gs.consecutiveTouches = 0;
                      launchSpeed = SMASH_SPEED;
                      ball.speed = SMASH_SPEED;
                      setSmashFlash(true);
                      setTimeout(() => setSmashFlash(false), 1000);
                    } else {
                      // Masih hitungan biasa
                      launchSpeed = Math.min(ball.speed + SPEED_INCREMENT, MAX_SPEED);
                      ball.speed = launchSpeed;
                    }
                  } else {
                    // Lawan menyentuh → reset smash dan consecutive
                    gs.isSmash = false;
                    gs.consecutiveTouches = 1;
                    launchSpeed = Math.min(ball.speed + SPEED_INCREMENT, MAX_SPEED);
                    ball.speed = launchSpeed;
                  }

                  gs.lastTouchSide = touchSide;

                  ball.vx = nx * ball.speed;
                  ball.vy = ny * ball.speed;

                  if (Math.abs(ball.vx) < 2) ball.vx = Math.sign(ball.vx) * 2;
                  if (Math.abs(ball.vy) < 2) ball.vy = Math.sign(ball.vy) * 2;

                  gameState.current.lastBounceTime = now;
                  bounced = true;
                }
              });
            });
          }
        }

        // 3. Render Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // A. Gambar Video Mirrored sebagai Background
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();

        // Dark cinematic overlay
        ctx.fillStyle = "rgba(0, 0, 15, 0.55)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Scanline effect for sci-fi feel
        ctx.fillStyle = "rgba(0, 255, 255, 0.025)";
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.fillRect(0, y, canvas.width, 1);
        }

        // B. Goal zones — Saber energy gates (cyan left, crimson right)
        const gateW = 70;
        const leftGate = ctx.createLinearGradient(0, 0, gateW, 0);
        leftGate.addColorStop(0, "rgba(220, 38, 38, 0.7)");
        leftGate.addColorStop(1, "rgba(220, 38, 38, 0)");
        ctx.fillStyle = leftGate;
        ctx.fillRect(0, 0, gateW, canvas.height);
        // Left edge bar
        ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
        ctx.fillRect(0, 0, 4, canvas.height);

        const rightGate = ctx.createLinearGradient(
          canvas.width,
          0,
          canvas.width - gateW,
          0,
        );
        rightGate.addColorStop(0, "rgba(220, 38, 38, 0.7)");
        rightGate.addColorStop(1, "rgba(220, 38, 38, 0)");
        ctx.fillStyle = rightGate;
        ctx.fillRect(canvas.width - gateW, 0, gateW, canvas.height);
        // Right edge bar
        ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
        ctx.fillRect(canvas.width - 4, 0, 4, canvas.height);

        // Center divider — energy beam
        const midGrad = ctx.createLinearGradient(
          canvas.width / 2 - 2,
          0,
          canvas.width / 2 + 2,
          0,
        );
        midGrad.addColorStop(0, "rgba(0,255,255,0)");
        midGrad.addColorStop(0.5, "rgba(0,255,255,0.3)");
        midGrad.addColorStop(1, "rgba(0,255,255,0)");
        ctx.fillStyle = midGrad;
        ctx.fillRect(canvas.width / 2 - 2, 0, 4, canvas.height);
        // Dashes on center
        ctx.save();
        ctx.setLineDash([18, 12]);
        ctx.strokeStyle = "rgba(0, 255, 255, 0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        ctx.restore();

        // C. Gambar Interaksi Pemain (Saber energy nodes)
        gameState.current.poses.forEach((pose, index) => {
          // Player 0 = Cyan (left), Player 1 = Red (right)
          const neonColor = index === 0 ? "#00f0ff" : "#ff2a6d";
          const fillColor =
            index === 0 ? "rgba(0,240,255,0.05)" : "rgba(255,42,109,0.05)";
          const outerGlowColor =
            index === 0 ? "rgba(0,240,255,0.06)" : "rgba(255,42,109,0.06)";

          const drawNode = (
            pt: GamePoint | null,
            radius: number,
            label: string,
          ) => {
            if (!pt) return;

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius + 8, 0, 2 * Math.PI);
            ctx.fillStyle = outerGlowColor;
            ctx.fill();

            // Main circle fill
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = fillColor;
            ctx.fill();

            // Neon stroke with shadow
            ctx.shadowBlur = 20;
            ctx.shadowColor = neonColor;
            ctx.lineWidth = 3;
            ctx.strokeStyle = neonColor;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner crosshair
            ctx.strokeStyle = `${neonColor}88`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pt.x - radius * 0.6, pt.y);
            ctx.lineTo(pt.x + radius * 0.6, pt.y);
            ctx.moveTo(pt.x, pt.y - radius * 0.6);
            ctx.lineTo(pt.x, pt.y + radius * 0.6);
            ctx.stroke();

            // Label
            ctx.shadowBlur = 10;
            ctx.shadowColor = neonColor;
            ctx.fillStyle = neonColor;
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.fillText(label, pt.x, pt.y + radius + 16);
            ctx.shadowBlur = 0;
          };

          drawNode(
            pose.head,
            HEAD_RADIUS,
            index === 0 ? "WARRIOR A" : "WARRIOR B",
          );
          drawNode(pose.leftWrist, HAND_RADIUS, "[ SABER ]");
          drawNode(pose.rightWrist, HAND_RADIUS, "[ SABER ]");
        });

        // D. Draw Ball — plasma / charge / smash orb
        const ball = gameState.current.ball;
        const isSmash = gameState.current.isSmash;
        const isCharging = gameState.current.consecutiveTouches === 1;

        // Choose colors based on state
        const coreColor  = isSmash  ? "#FF1010" : isCharging ? "#FF8000" : "#FFE000";
        const glowColor  = isSmash  ? "#FF0000" : isCharging ? "#FF6000" : "#FFD700";
        const auraRadius = isSmash  ? BALL_RADIUS * 5 : isCharging ? BALL_RADIUS * 4 : BALL_RADIUS * 3;
        const auraAlpha  = isSmash  ? 0.8 : isCharging ? 0.6 : 0.6;
        const auraAlpha2 = isSmash  ? 0.4 : isCharging ? 0.3 : 0.2;

        // Outer aura
        const ballGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, auraRadius);
        ballGrad.addColorStop(0, `rgba(${isSmash ? "255,30,30" : isCharging ? "255,120,0" : "255,235,50"},${auraAlpha})`);
        ballGrad.addColorStop(0.4, `rgba(${isSmash ? "255,0,0" : isCharging ? "255,80,0" : "255,120,0"},${auraAlpha2})`);
        ballGrad.addColorStop(1, "rgba(255,0,0,0)");
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, auraRadius, 0, 2 * Math.PI);
        ctx.fillStyle = ballGrad;
        ctx.fill();

        // Core orb
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, 2 * Math.PI);
        ctx.shadowBlur = isSmash ? 50 : 30;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = coreColor;
        ctx.fill();

        // SMASH ring pulse
        if (isSmash) {
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, BALL_RADIUS + 10, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(255,50,50,0.7)";
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        // Specular highlight
        ctx.beginPath();
        ctx.arc(ball.x - BALL_RADIUS * 0.3, ball.y - BALL_RADIUS * 0.35, BALL_RADIUS * 0.35, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.shadowBlur = 0;
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(loop);
    },
    [playerCount, handleGoal],
  );

  // --- INISIALISASI AI & WEBCAM ---
  useEffect(() => {
    let isComponentMounted = true;

    const initSetup = async () => {
      try {
        // 1. Inisialisasi PoseLandmarker menggunakan NPM package
        setStatusText("Inisialisasi Model Pose (GPU)...");

        // Memuat file WASM (tetap direkomendasikan menggunakan URL CDN oleh dokumentasi resmi agar tidak membebani bundler)
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm",
        );

        poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 2, // Mendukung 2 pemain sesuai PRD
          },
        );

        if (!isComponentMounted) return;

        // 2. Akses Webcam
        setStatusText("Meminta akses kamera...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: false,
        });

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            handleResize(); // Set ukuran awal kanvas
            updateUiState("START");
            setStatusText("Sistem Siap. Menunggu pemain.");
          };
        }
      } catch (error: Error | unknown) {
        console.error("Setup Error:", error);
        if (error instanceof Error) {
          setStatusText(
            `Error: ${error.message}. Pastikan izin kamera diberikan.`,
          );
        } else {
          setStatusText("Terjadi error yang tidak diketahui.");
        }
      }
    };

    initSetup();

    // Event listener resize
    window.addEventListener("resize", handleResize);

    const video = videoRef.current;

    return () => {
      isComponentMounted = false;
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (poseLandmarkerRef.current) poseLandmarkerRef.current.close();
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [handleResize, updateUiState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-mono text-white select-none">
      {/* Hidden video for AI */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        autoPlay
        muted
      ></video>

      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block z-0"
      ></canvas>

      {/* ── OVERLAY UI ── */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col">
        {/* ── HEADER HUD ── */}
        {(uiState === "PLAYING" || uiState === "COUNTDOWN") && (
          <div className="flex items-stretch">
            {/* Left player score */}
            <div className="flex-1 flex items-center gap-3 px-6 py-3 bg-cyan-500/10 border-b-2 border-cyan-400/60">
              <div className="w-2 h-10 rounded-full bg-cyan-400 shadow-[0_0_12px_#00f0ff]" />
              <div>
                <div className="text-[10px] tracking-[0.25em] text-cyan-400 font-bold">
                  WARRIOR A
                </div>
                <div className="text-5xl font-black text-cyan-300 leading-none drop-shadow-[0_0_12px_#00f0ff]">
                  {scores.left}
                </div>
              </div>
            </div>

            {/* Center title */}
            <div className="flex flex-col items-center justify-center px-8 py-2 bg-black/60 border-b-2 border-white/10">
              <div className="text-[9px] tracking-[0.4em] text-white/40 uppercase">
                ⚔ SABER COMBAT ⚔
              </div>
              <div className="text-xs tracking-[0.3em] text-white/30">
                {uiState === "COUNTDOWN"
                  ? "PREPARE"
                  : `FIRST TO ${WINNING_SCORE}`}
              </div>
            </div>

            {/* Right player score */}
            <div className="flex-1 flex items-center justify-end gap-3 px-6 py-3 bg-red-500/10 border-b-2 border-red-400/60">
              <div className="text-right">
                <div className="text-[10px] tracking-[0.25em] text-red-400 font-bold">
                  WARRIOR B
                </div>
                <div className="text-5xl font-black text-red-300 leading-none drop-shadow-[0_0_12px_#ff2a6d]">
                  {scores.right}
                </div>
              </div>
              <div className="w-2 h-10 rounded-full bg-red-400 shadow-[0_0_12px_#ff2a6d]" />
            </div>
          </div>
        )}

        {/* ── SMASH FLASH ── */}
        {smashFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="text-center animate-bounce">
              <div
                className="text-[7rem] font-black leading-none tracking-tight"
                style={{ color: "#FF1010", textShadow: "0 0 60px #FF0000, 0 0 100px #FF0000" }}
              >
                ⚡ SMASH! ⚡
              </div>
            </div>
          </div>
        )}

        {/* ── CENTER STATES ── */}
        <div className="flex-grow flex flex-col justify-center items-center">
          {/* LOADING */}
          {uiState === "LOADING" && (
            <div className="pointer-events-auto text-center px-10 py-8 rounded-2xl border border-cyan-500/30 bg-black/70 backdrop-blur-md shadow-[0_0_40px_rgba(0,240,255,0.15)]">
              <div className="text-[10px] tracking-[0.5em] text-cyan-400 mb-4 animate-pulse">
                SYSTEM BOOT
              </div>
              <h1 className="text-5xl font-black tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                SABER PONG
              </h1>
              <p className="text-sm text-white/50 tracking-widest mb-6">
                COMBAT VISION ENGINE
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_10px_#00f0ff]"></div>
                <span className="text-cyan-300 text-sm tracking-wider">
                  {statusText}
                </span>
              </div>
            </div>
          )}

          {/* START */}
          {uiState === "START" && (
            <div className="pointer-events-auto max-w-xl w-full mx-4">
              {/* Title card */}
              <div className="text-center mb-6">
                <div className="text-[9px] tracking-[0.5em] text-cyan-400 mb-1 animate-pulse">
                  ⚡ COMBAT SYSTEM ONLINE ⚡
                </div>
                <h1 className="text-7xl font-black tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-300 to-purple-400 drop-shadow-[0_0_30px_rgba(0,240,255,0.5)]">
                  SABER
                  <br />
                  PONG
                </h1>
              </div>

              {/* Holographic instruction panel */}
              <div className="bg-black/60 border border-cyan-500/30 rounded-xl p-5 mb-5 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.08)] text-sm">
                <div className="text-[9px] tracking-[0.4em] text-cyan-500 mb-3 border-b border-cyan-500/20 pb-2">
                  {" "}
                  COMBAT MANUAL
                </div>
                <ul className="space-y-2 text-white/70">
                  <li className="flex gap-3">
                    <span className="text-cyan-400 shrink-0">→</span>Mundur agar
                    seluruh tubuh terlihat kamera
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-400 shrink-0">→</span>Gunakan{" "}
                    <span className="text-cyan-300 font-bold">KEPALA</span>{" "}
                    &amp;{" "}
                    <span className="text-cyan-300 font-bold">TANGAN</span>{" "}
                    sebagai saber untuk memantulkan bola plasma
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-400 shrink-0">→</span>Arahkan
                    bola ke gawang{" "}
                    <span className="text-red-400 font-bold">MERAH</span> lawan
                  </li>
                  <li className="flex gap-3">
                    <span className="text-yellow-400 shrink-0">★</span>Raih{" "}
                    <span className="text-yellow-300 font-bold">
                      {WINNING_SCORE} poin
                    </span>{" "}
                    untuk menang!
                  </li>
                </ul>
              </div>

              {/* CTA */}
              <button
                onClick={startGame}
                className="w-full py-4 rounded-xl font-black text-xl tracking-widest uppercase
                  bg-gradient-to-r from-cyan-500 to-purple-600
                  hover:from-cyan-400 hover:to-purple-500
                  shadow-[0_0_30px_rgba(0,240,255,0.4)]
                  hover:shadow-[0_0_50px_rgba(0,240,255,0.7)]
                  transition-all duration-200 active:scale-95"
              >
                ⚔ MULAI PERTEMPURAN ⚔
              </button>
            </div>
          )}

          {/* COUNTDOWN */}
          {uiState === "COUNTDOWN" && (
            <div className="text-center">
              <div className="text-[11px] tracking-[0.4em] text-cyan-400 mb-2 animate-pulse">
                COMBAT BEGINS IN
              </div>
              <div
                key={String(countdown)}
                className="text-[12rem] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-400 drop-shadow-[0_0_60px_rgba(0,240,255,0.8)]"
                style={{ textShadow: "0 0 60px rgba(0,240,255,0.8)" }}
              >
                {countdown}
              </div>
            </div>
          )}

          {/* END */}
          {uiState === "END" && (
            <div className="pointer-events-auto text-center max-w-md w-full mx-4">
              <div className="text-[9px] tracking-[0.4em] text-yellow-400 mb-2 animate-pulse">
                ⚔ BATTLE COMPLETE ⚔
              </div>
              <h2 className="text-6xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-500 drop-shadow-[0_0_30px_rgba(255,200,0,0.7)]">
                VICTORY
              </h2>
              <p className="text-white/50 text-sm tracking-widest mb-2">
                CHAMPION
              </p>
              <p className="text-2xl font-bold tracking-wider text-white mb-6 border border-white/10 py-3 rounded-xl bg-white/5">
                {winner}
              </p>
              <div className="text-sm text-white/40 mb-4 tracking-widest">
                FINAL SCORE: {scores.left} — {scores.right}
              </div>
              <button
                onClick={startGame}
                className="w-full py-3 rounded-xl font-bold text-base tracking-widest uppercase
                  border border-cyan-500/50 text-cyan-300
                  hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]
                  transition-all duration-200 active:scale-95"
              >
                REMATCH
              </button>
            </div>
          )}
        </div>

        {/* ── FOOTER STATUS BAR ── */}
        <div
          className="pointer-events-auto flex justify-between items-center px-5 py-2
          bg-black/70 border-t border-cyan-500/20 text-[10px] tracking-[0.2em] font-bold"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${uiState === "LOADING" ? "bg-yellow-400" : "bg-cyan-400"}`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${uiState === "LOADING" ? "bg-yellow-500" : "bg-cyan-500"}`}
              ></span>
            </span>
            <span
              className={
                uiState === "LOADING" ? "text-yellow-300" : "text-cyan-300"
              }
            >
              {statusText}
            </span>
          </div>
          <div className="text-white/40">
            WARRIORS DETECTED:{" "}
            <span className="text-cyan-300">{playerCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
