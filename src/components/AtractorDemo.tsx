import React, { useEffect, useRef, useState } from "react";
import { Sliders } from "lucide-react";

interface AtractorDemoProps {
  eps: number;
  epsIndex: number;
  x0: number;
  rho: number;
  sigma: number;
  beta: number;
  speed: number;
  playing: boolean;
  autoRotate: boolean;
  resetCounter: number;
  canControl: boolean;
  onUpdateParam: (key: string, value: any) => void;
  onControlAction: (action: "play" | "pause" | "reset") => void;
}

export default function AtractorDemo({
  eps,
  epsIndex,
  x0,
  rho,
  sigma,
  beta,
  speed,
  playing,
  autoRotate,
  resetCounter,
  canControl,
  onUpdateParam,
  onControlAction,
}: AtractorDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparkRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showMobileControls, setShowMobileControls] = useState(false);

  // Estados locales para la simulación
  const stateRef = useRef({
    A: { x: x0, y: 1.0, z: 1.0 },
    B: { x: x0 + eps, y: 1.0, z: 1.0 },
    trailA: [] as Array<{ x: number; y: number; z: number }>,
    trailB: [] as Array<{ x: number; y: number; z: number }>,
    simTime: 0,
    distHistory: [] as number[],
    lastResetCounter: resetCounter,
  });

  const DT = 0.005;
  const STEPS_PER_FRAME = 6;
  const MAX_TRAIL = 3500;
  const center = { x: 0, y: 0, z: 25 };

  // Parámetros de simulación reactivos
  const paramsRef = useRef({ sigma, rho, beta, eps, x0, speed, playing });
  useEffect(() => {
    paramsRef.current = { sigma, rho, beta, eps, x0, speed, playing };
  }, [sigma, rho, beta, eps, x0, speed, playing]);

  // Cámara local (interactiva por cada cliente)
  const cameraRef = useRef({
    yaw: 0.6,
    pitch: -0.35,
    zoom: 1.0,
    autoYaw: 0.0,
  });

  const [simTimeState, setSimTimeState] = useState(0);
  const [currentDistance, setCurrentDistance] = useState(0);

  // Derivada de Lorenz
  const deriv = (s: { x: number; y: number; z: number }, sig: number, r: number, b: number) => {
    return {
      x: sig * (s.y - s.x),
      y: s.x * (r - s.z) - s.y,
      z: s.x * s.y - b * s.z,
    };
  };

  // RK4
  const rk4 = (s: { x: number; y: number; z: number }, dt: number, sig: number, r: number, b: number) => {
    const k1 = deriv(s, sig, r, b);
    const s2 = { x: s.x + (dt / 2) * k1.x, y: s.y + (dt / 2) * k1.y, z: s.z + (dt / 2) * k1.z };
    const k2 = deriv(s2, sig, r, b);
    const s3 = { x: s.x + (dt / 2) * k2.x, y: s.y + (dt / 2) * k2.y, z: s.z + (dt / 2) * k2.z };
    const k3 = deriv(s3, sig, r, b);
    const s4 = { x: s.x + dt * k3.x, y: s.y + dt * k3.y, z: s.z + dt * k3.z };
    const k4 = deriv(s4, sig, r, b);
    return {
      x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      z: s.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
    };
  };

  const localReset = () => {
    const { x0: cx0, eps: ceps } = paramsRef.current;
    stateRef.current.A = { x: cx0, y: 1.0, z: 1.0 };
    stateRef.current.B = { x: cx0 + ceps, y: 1.0, z: 1.0 };
    stateRef.current.trailA = [];
    stateRef.current.trailB = [];
    stateRef.current.distHistory = [];
    stateRef.current.simTime = 0;
    setSimTimeState(0);
    setCurrentDistance(0);
  };

  // Reset de la cámara local
  const resetCamera = () => {
    cameraRef.current = {
      yaw: 0.6,
      pitch: -0.35,
      zoom: 1.0,
      autoYaw: 0.0,
    };
  };

  // Resetear simulación cuando cambian los parámetros para ver el impacto en tiempo real
  useEffect(() => {
    localReset();
  }, [eps, x0, rho, sigma, beta]);

  // Escuchar reinicios externos
  useEffect(() => {
    if (resetCounter !== stateRef.current.lastResetCounter) {
      stateRef.current.lastResetCounter = resetCounter;
      localReset();
    }
  }, [resetCounter]);

  // Bucle principal del canvas 3D y sparkline
  useEffect(() => {
    const cv = canvasRef.current;
    const spark = sparkRef.current;
    if (!cv || !spark) return;

    const ctx = cv.getContext("2d");
    const sctx = spark.getContext("2d");
    if (!ctx || !sctx) return;

    let animFrameId: number;
    let W = 0;
    let H = 0;
    let baseScale = 10;
    let sw = 0;
    let sh = 0;

    const handleResize = () => {
      if (!cv || !containerRef.current || !spark) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Main Canvas
      const r = containerRef.current.getBoundingClientRect();
      W = r.width;
      H = r.height || 450;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseScale = Math.min(W, H) / 14.0;

      // Spark Canvas
      const sr = spark.getBoundingClientRect();
      sw = sr.width;
      sh = sr.height || 54;
      spark.width = sw * dpr;
      spark.height = sh * dpr;
      spark.style.width = `${sw}px`;
      spark.style.height = `${sh}px`;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);

    // Proyección 3D → 2D
    const project = (p: { x: number; y: number; z: number }) => {
      const { yaw, pitch, zoom, autoYaw } = cameraRef.current;
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const dz = p.z - center.z;

      const cy = Math.cos(yaw + autoYaw);
      const sy = Math.sin(yaw + autoYaw);

      const rx = dx * cy - dz * sy;
      let rz = dx * sy + dz * cy;

      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);

      const ry = dy * cp - rz * sp;
      rz = dy * sp + rz * cp;

      const persp = 1 / (1 + rz * 0.0009); // perspectiva leve
      return {
        sx: W / 2 + rx * baseScale * zoom * persp,
        sy: H / 2 + ry * baseScale * zoom * persp,
        depth: rz,
      };
    };

    const drawTrail = (trail: Array<{ x: number; y: number; z: number }>, colorTemplate: string) => {
      if (trail.length < 2) return;
      const pts = trail.map((p) => project(p));
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        // Factor de desvanecimiento
        const alpha = Math.pow(i / pts.length, 1.5) * 0.9;
        ctx.strokeStyle = colorTemplate.replace("ALPHA", alpha.toFixed(3));
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // Cabeza luminosa
      const head = pts[pts.length - 1];
      ctx.fillStyle = colorTemplate.replace("ALPHA", "1");
      ctx.shadowColor = colorTemplate.replace("ALPHA", "1");
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(head.sx, head.sy, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const drawSpark = (isDiverged: boolean) => {
      sctx.clearRect(0, 0, sw, sh);
      const { distHistory } = stateRef.current;
      if (distHistory.length < 2) return;

      const lo = -7;
      const hi = 2;
      const n = distHistory.length;
      sctx.strokeStyle = isDiverged ? "#ef4444" : "#2dd4bf";
      sctx.lineWidth = 1.6;
      sctx.beginPath();

      for (let i = 0; i < n; i++) {
        const v = Math.max(lo, Math.min(hi, distHistory[i]));
        const px = (i / (n - 1)) * sw;
        const py = sh - ((v - lo) / (hi - lo)) * sh;
        if (i === 0) {
          sctx.moveTo(px, py);
        } else {
          sctx.lineTo(px, py);
        }
      }
      sctx.stroke();
    };

    const stepSim = () => {
      const { sigma: s, rho: r, beta: b, speed: currentSpeed } = paramsRef.current;
      const sub = Math.max(1, Math.round(STEPS_PER_FRAME * currentSpeed));

      for (let i = 0; i < sub; i++) {
        stateRef.current.A = rk4(stateRef.current.A, DT, s, r, b);
        stateRef.current.B = rk4(stateRef.current.B, DT, s, r, b);
        stateRef.current.trailA.push({ ...stateRef.current.A });
        stateRef.current.trailB.push({ ...stateRef.current.B });

        if (stateRef.current.trailA.length > MAX_TRAIL) stateRef.current.trailA.shift();
        if (stateRef.current.trailB.length > MAX_TRAIL) stateRef.current.trailB.shift();

        stateRef.current.simTime += DT;
      }
    };

    const renderLoop = () => {
      const { playing: isPlaying } = paramsRef.current;

      if (isPlaying) {
        stepSim();
        if (autoRotate) {
          cameraRef.current.autoYaw += 0.0016;
        }
      }

      // Dibujar fondo de espacio profundo
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, W, H);

      // Halo central sutil
      const radialGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 1.4);
      radialGrad.addColorStop(0, "rgba(45,212,191,0.12)");
      radialGrad.addColorStop(1, "rgba(5,5,5,0)");
      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, W, H);

      // Dibujar las estelas
      drawTrail(stateRef.current.trailA, "rgba(45,212,191,ALPHA)");
      drawTrail(stateRef.current.trailB, "rgba(245,158,11,ALPHA)");

      // Actualizar variables de lectura para React
      if (isPlaying) {
        const dx = stateRef.current.A.x - stateRef.current.B.x;
        const dy = stateRef.current.A.y - stateRef.current.B.y;
        const dz = stateRef.current.A.z - stateRef.current.B.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        stateRef.current.distHistory.push(Math.log10(Math.max(d, 1e-12)));
        if (stateRef.current.distHistory.length > 240) {
          stateRef.current.distHistory.shift();
        }

        setCurrentDistance(d);
        setSimTimeState(stateRef.current.simTime);
        drawSpark(d > 5);
      } else {
        // Redibujar el spark sin añadir nuevos datos si está pausado
        const lastDist = currentDistance;
        drawSpark(lastDist > 5);
      }

      animFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animFrameId);
      observer.disconnect();
    };
  }, [autoRotate]);

  // Manejar el arrastre para rotación de cámara
  const draggingRef = useRef(false);
  const lastCoordsRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastCoordsRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const deltaX = e.clientX - lastCoordsRef.current.x;
    const deltaY = e.clientY - lastCoordsRef.current.y;

    cameraRef.current.yaw += deltaX * 0.006;
    cameraRef.current.pitch += deltaY * 0.006;
    cameraRef.current.pitch = Math.max(-1.4, Math.min(1.4, cameraRef.current.pitch));

    lastCoordsRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    cameraRef.current.zoom *= e.deltaY < 0 ? 1.08 : 0.93;
    cameraRef.current.zoom = Math.max(0.1, Math.min(5.0, cameraRef.current.zoom));
  };

  // Etiquetas informativas de la divergencia
  const getDivergenceLabel = (d: number) => {
    if (d > 5) return "¡Divergieron! Mismo origen, destinos opuestos.";
    if (d > 0.5) return "Empiezan a separarse…";
    return "Avanzan juntas…";
  };

  return (
    <div className="relative flex flex-col lg:grid lg:grid-cols-[340px_1fr] h-full w-full min-h-0 overflow-hidden bg-hw-bg">
      {/* Botón flotante para controles en móvil/resoluciones bajas */}
      <button
        onClick={() => setShowMobileControls(!showMobileControls)}
        className="lg:hidden absolute bottom-5 left-5 z-20 flex items-center gap-1.5 bg-hw-cyan text-hw-bg font-mono font-bold text-[11px] px-3.5 py-2 border border-hw-cyan rounded shadow-lg cursor-pointer uppercase hover:bg-[#25bca8] transition-colors"
      >
        <Sliders className="w-4 h-4" />
        <span>{showMobileControls ? "Ocultar Controles" : "Ajustes Simulación"}</span>
      </button>

      {/* ---------- PANEL DE CONTROL ---------- */}
      <aside className={`
        bg-hw-panel border-r border-hw-border p-5 overflow-y-auto flex flex-col gap-5 select-none min-h-0
        absolute lg:static inset-y-0 left-0 z-10 w-[300px] sm:w-[340px] transition-transform duration-300
        ${showMobileControls ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.25em] uppercase text-hw-cyan font-bold font-mono">
            // TEORÍA DEL CAOS · 1963
          </span>
          <h1 className="text-lg font-mono font-bold tracking-wider text-white uppercase leading-tight">
            El Atractor de Lorenz
          </h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            Dos trayectorias parten casi del mismo punto. Mismas reglas, sin azar. Observa cuándo dejan de coincidir.
          </p>
        </div>

        {/* Grupo Mariposa */}
        <div className="border border-hw-border bg-hw-panel/40 p-4 flex flex-col gap-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold">
            // EL ALETEO DE LA MARIPOSA
          </h2>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">Perturbación · ε</span>
              <span className="text-hw-cyan font-bold">
                {eps < 1e-3 ? eps.toExponential(0) : eps.toFixed(4)}
              </span>
            </div>
            <input
              type="range"
              min="-7"
              max="0"
              step="0.1"
              value={epsIndex}
              disabled={!canControl}
              onChange={(e) => {
                const idx = parseFloat(e.target.value);
                onUpdateParam("epsIndex", idx);
                onUpdateParam("eps", Math.pow(10, idx));
              }}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
            <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed font-mono">
              La segunda trayectoria empieza <b className="text-gray-400">ε</b> más lejos en x. Hazla diminuta y mira cómo, aun así, todo cambia.
            </p>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">Posición inicial · x₀</span>
              <span className="text-hw-cyan font-bold">{x0.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="-15"
              max="15"
              step="0.1"
              value={x0}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("x0", parseFloat(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>
        </div>

        {/* Parámetros del Sistema */}
        <div className="border border-hw-border bg-hw-panel/40 p-4 flex flex-col gap-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold">
            // PARÁMETROS DEL SISTEMA
          </h2>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">ρ · rho (caos)</span>
              <span className="text-hw-cyan font-bold">{rho.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="0.5"
              value={rho}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("rho", parseFloat(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed font-mono">
              Por debajo de ~24.7 el sistema se calma; por encima, entra en caos.
            </p>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">σ · sigma</span>
              <span className="text-hw-cyan font-bold">{sigma.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={sigma}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("sigma", parseFloat(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">β · beta</span>
              <span className="text-hw-cyan font-bold">{beta.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.05"
              value={beta}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("beta", parseFloat(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>
        </div>

        {/* Controles de Simulación */}
        <div className="border border-hw-border bg-hw-panel/40 p-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold mb-3">
            // CONTROLES DE SIMULACIÓN
          </h2>

          <div className="flex flex-col mb-4">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">Velocidad</span>
              <span className="text-hw-cyan font-bold">{speed.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.1"
              value={speed}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("speed", parseFloat(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => onControlAction(playing ? "pause" : "play")}
                disabled={!canControl}
                className={`flex-1 text-xs font-mono font-bold py-2 px-3 rounded border tracking-wider transition cursor-pointer uppercase ${
                  playing
                    ? "bg-hw-cyan hover:bg-[#25bca8] border-hw-cyan text-hw-bg"
                    : "bg-hw-panel hover:bg-[#1f1f1f] border-hw-border text-white"
                } ${!canControl ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {playing ? "PAUSAR" : "REANUDAR"}
              </button>
              <button
                onClick={() => onControlAction("reset")}
                disabled={!canControl}
                className={`flex-1 text-xs font-mono font-bold py-2 px-3 rounded border bg-hw-panel hover:bg-[#1f1f1f] border-hw-border text-white tracking-wider cursor-pointer uppercase ${
                  !canControl ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                REINICIAR
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={resetCamera}
                className="flex-1 text-xs font-mono font-bold py-2 px-2 rounded border bg-hw-panel hover:bg-[#1f1f1f] border-hw-border text-white tracking-wider cursor-pointer uppercase"
              >
                RESET CÁMARA
              </button>
              <button
                onClick={() => onUpdateParam("autoRotate", !autoRotate)}
                className={`flex-1 text-xs font-mono font-bold py-2 px-2 rounded border cursor-pointer tracking-wider uppercase ${
                  autoRotate
                    ? "bg-hw-cyan border-hw-cyan text-hw-bg"
                    : "bg-hw-panel border-hw-border text-gray-400 hover:text-white"
                }`}
              >
                ROTAR: {autoRotate ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>

        {!canControl && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 text-[10px] text-center font-mono uppercase tracking-wider leading-relaxed">
            🔒 CONTROL BLOQUEADO POR PRESENTADOR
          </div>
        )}

        <p className="text-[10px] text-gray-500 leading-relaxed font-mono mt-auto pt-4">
          Sistema de Lorenz · <b>ẋ=σ(y−x)</b>, <b>ẏ=x(ρ−z)−y</b>, <b>ż=xy−βz</b>. Arrastra el lienzo para rotar · rueda para acercar.
        </p>
      </aside>

      {/* ---------- VISTA (CANVAS 3D) ---------- */}
      <section
        ref={containerRef}
        className="relative w-full h-full bg-hw-bg min-h-0 flex flex-col justify-end overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className="absolute inset-0 block w-full h-full cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Lector de Distancia */}
        <div className="absolute top-5 right-5 w-[240px] md:w-[260px] bg-hw-panel/95 backdrop-blur-md border border-hw-border p-4 z-10 select-none">
          <div className="text-[11px] tracking-widest uppercase text-gray-500 font-bold font-mono mb-1.5">
            // DISTANCIA ENTRADA-SALIDA
          </div>
          <div
            className={`text-3xl font-mono font-bold tracking-tight leading-none ${
              currentDistance > 5 ? "text-red-500" : "text-hw-cyan"
            }`}
          >
            {currentDistance < 0.001 ? currentDistance.toExponential(2) : currentDistance.toFixed(3)}
          </div>
          <div className="text-xs text-gray-400 mt-2.5 leading-relaxed min-h-[16px] font-mono">
            {getDivergenceLabel(currentDistance)}
          </div>

          {/* Sparkline Canvas */}
          <canvas ref={sparkRef} className="block w-full h-[54px] bg-black/40 border border-hw-border mt-3.5" />

          <div className="flex justify-between mt-2.5 border-t border-hw-border pt-2.5 text-[10.5px] font-mono uppercase">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-3 h-3 bg-hw-cyan" /> base
            </span>
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-3 h-3 bg-hw-amber" /> perturbada (ε)
            </span>
          </div>
        </div>

        <div className="absolute bottom-16 lg:bottom-5 left-5 font-mono text-xs text-gray-500">
          T = <span className="text-hw-cyan font-bold">{simTimeState.toFixed(1)}</span>
        </div>
      </section>
    </div>
  );
}
