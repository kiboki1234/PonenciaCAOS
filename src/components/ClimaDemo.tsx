import { useEffect, useRef, useState } from "react";

interface ClimaDemoProps {
  precision: number;
  rho: number;
  speed: number;
  playing: boolean;
  resetCounter: number;
  canControl: boolean;
  onUpdateParam: (key: string, value: any) => void;
  onControlAction: (action: "play" | "pause" | "reset") => void;
}

export default function ClimaDemo({
  precision,
  rho,
  speed,
  playing,
  resetCounter,
  canControl,
  onUpdateParam,
  onControlAction,
}: ClimaDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Estados locales para la simulación
  const stateRef = useRef({
    A: { x: 5.067283, y: 1.0, z: 1.0 },
    B: { x: 5.067283, y: 1.0, z: 1.0 },
    series: [] as Array<{ t: number; a: number; b: number }>,
    simTime: 0,
    divergedAt: null as number | null,
    lastResetCounter: resetCounter,
  });

  const STORED_X0 = 5.067283;
  const DT = 0.005;
  const STEPS_PER_FRAME = 7;
  const WINDOW_DAYS = 45;
  const Y_RANGE = 26;

  // Parámetros dinámicos para la simulación
  const paramsRef = useRef({ rho, precision, speed, playing });

  useEffect(() => {
    paramsRef.current = { rho, precision, speed, playing };
  }, [rho, precision, speed, playing]);

  // Función para redondear x0 según los decimales tecleados
  const roundedX0 = (prec: number) => {
    const f = Math.pow(10, prec);
    return Math.round(STORED_X0 * f) / f;
  };

  // Función de integración RK4
  const deriv = (s: { x: number; y: number; z: number }, r: number) => {
    return {
      x: 10 * (s.y - s.x),
      y: s.x * (r - s.z) - s.y,
      z: s.x * s.y - (8 / 3) * s.z,
    };
  };

  const rk4 = (s: { x: number; y: number; z: number }, dt: number, r: number) => {
    const k1 = deriv(s, r);
    const s2 = { x: s.x + (dt / 2) * k1.x, y: s.y + (dt / 2) * k1.y, z: s.z + (dt / 2) * k1.z };
    const k2 = deriv(s2, r);
    const s3 = { x: s.x + (dt / 2) * k2.x, y: s.y + (dt / 2) * k2.y, z: s.z + (dt / 2) * k2.z };
    const k3 = deriv(s3, r);
    const s4 = { x: s.x + dt * k3.x, y: s.y + dt * k3.y, z: s.z + dt * k3.z };
    const k4 = deriv(s4, r);
    return {
      x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      z: s.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
    };
  };

  // Reinicio local de la simulación
  const localReset = () => {
    const { precision: prec } = paramsRef.current;
    stateRef.current.A = { x: STORED_X0, y: 1.0, z: 1.0 };
    stateRef.current.B = { x: roundedX0(prec), y: 1.0, z: 1.0 };
    stateRef.current.series = [];
    stateRef.current.simTime = 0;
    stateRef.current.divergedAt = null;
  };

  // Efecto para escuchar reinicios externos de la simulación
  useEffect(() => {
    if (resetCounter !== stateRef.current.lastResetCounter) {
      stateRef.current.lastResetCounter = resetCounter;
      localReset();
    }
  }, [resetCounter]);

  // Bucle de animación y renderizado
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    let W = 0;
    let H = 0;
    const padL = 58;
    const padR = 24;
    const padT = 34;
    const padB = 40;

    const handleResize = () => {
      if (!cv || !containerRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = containerRef.current.getBoundingClientRect();
      W = r.width;
      H = r.height || 450;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);

    const tToX = (t: number, tStart: number) => {
      const plotW = W - padL - padR;
      return padL + ((t - tStart) / WINDOW_DAYS) * plotW;
    };

    const vToY = (v: number) => {
      const plotH = H - padT - padB;
      return padT + plotH / 2 - (v / Y_RANGE) * (plotH / 2);
    };

    const drawGrid = (tStart: number) => {
      ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#888888";
      ctx.font = "11px var(--font-mono)";

      // Líneas horizontales
      for (let v = -20; v <= 20; v += 10) {
        const y = vToY(v);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(v.toString(), padL - 8, y + 4);
      }

      // Marcas de días (verticales)
      ctx.textAlign = "center";
      const day0 = Math.ceil(tStart / 10) * 10;
      for (let d = day0; d <= tStart + WINDOW_DAYS; d += 10) {
        const x = tToX(d, tStart);
        ctx.strokeStyle = "#121212";
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, H - padB);
        ctx.stroke();
        ctx.fillStyle = "#888888";
        ctx.fillText("día " + Math.round(d), x, H - padB + 22);
      }

      // Línea cero
      ctx.strokeStyle = "#262626";
      ctx.beginPath();
      const yz = vToY(0);
      ctx.moveTo(padL, yz);
      ctx.lineTo(W - padR, yz);
      ctx.stroke();
    };

    const drawSeries = (tStart: number, key: "a" | "b", color: string) => {
      const { series } = stateRef.current;
      if (series.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (const p of series) {
        if (p.t < tStart - 0.5) continue;
        const x = tToX(p.t, tStart);
        const y = vToY(p[key]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    const drawDivergenceMarker = (tStart: number) => {
      const { divergedAt } = stateRef.current;
      if (divergedAt === null || divergedAt < tStart) return;
      const x = tToX(divergedAt, tStart);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ef4444";
      ctx.font = "700 11px var(--font-mono)";
      ctx.textAlign = "left";
      ctx.fillText("divergen", x + 6, padT + 14);
    };

    const stepSim = () => {
      const { rho: currentRho, speed: currentSpeed } = paramsRef.current;
      const sub = Math.max(1, Math.round(STEPS_PER_FRAME * currentSpeed));
      for (let i = 0; i < sub; i++) {
        stateRef.current.A = rk4(stateRef.current.A, DT, currentRho);
        stateRef.current.B = rk4(stateRef.current.B, DT, currentRho);
        stateRef.current.simTime += DT;
        stateRef.current.series.push({
          t: stateRef.current.simTime,
          a: stateRef.current.A.x,
          b: stateRef.current.B.x,
        });

        // Detectar divergencia (umbral en la variable atmosférica x)
        if (stateRef.current.divergedAt === null && Math.abs(stateRef.current.A.x - stateRef.current.B.x) > 6) {
          stateRef.current.divergedAt = stateRef.current.simTime;
        }
      }

      // Recortar historial al rango visible con margen
      const tStart = Math.max(0, stateRef.current.simTime - WINDOW_DAYS);
      while (stateRef.current.series.length && stateRef.current.series[0].t < tStart - 1) {
        stateRef.current.series.shift();
      }
    };

    // Bucle principal de animación
    const renderFrame = () => {
      const { playing: isPlaying } = paramsRef.current;
      if (isPlaying) {
        stepSim();
      }

      const tStart = Math.max(0, stateRef.current.simTime - WINDOW_DAYS);

      // Limpiar lienzo
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, W, H);

      // Etiqueta vertical
      ctx.save();
      ctx.translate(16, H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#888888";
      ctx.font = "11px var(--font-mono)";
      ctx.textAlign = "center";
      ctx.fillText("intensidad atmosférica (x)", 0, 0);
      ctx.restore();

      drawGrid(tStart);
      drawDivergenceMarker(tStart);
      drawSeries(tStart, "a", "#2dd4bf");
      drawSeries(tStart, "b", "#f59e0b");

      animFrameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animFrameId);
      observer.disconnect();
    };
  }, []);

  // Calcular valores en vivo para el panel
  const typedVal = roundedX0(precision);
  const diffVal = Math.abs(STORED_X0 - typedVal);
  const divergedAt = stateRef.current.divergedAt;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] h-full w-full min-h-0 overflow-hidden bg-hw-bg">
      {/* ---------- PANEL DE CONTROL ---------- */}
      <aside className="bg-hw-panel border-r border-hw-border p-5 lg:overflow-y-auto flex flex-col gap-5 select-none min-h-0">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.25em] uppercase text-hw-cyan font-bold font-mono">
            // EDWARD LORENZ · 1961
          </span>
          <h1 className="text-lg font-mono font-bold tracking-wider text-white uppercase leading-tight">
            Pronóstico del clima
          </h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            El mismo pronóstico, corrido dos veces. La única diferencia: cuántos decimales se teclearon al reiniciarlo.
          </p>
        </div>

        {/* Grupo Impresora */}
        <div className="border border-hw-border bg-hw-panel/40 p-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold mb-3">
            // LA IMPRESORA DE LORENZ
          </h2>
          <div className="bg-hw-bg border border-hw-border p-3 mb-3 font-mono text-xs">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-gray-400">La máquina guardaba</span>
              <span className="text-hw-cyan text-sm font-bold">{STORED_X0.toFixed(6)}</span>
            </div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-gray-400">Lorenz tecleó</span>
              <span className="text-hw-amber text-sm font-bold">{typedVal.toFixed(precision)}</span>
            </div>
            <div className="h-px bg-hw-border my-2" />
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-gray-400">Diferencia</span>
              <span className="text-red-500 font-bold">{diffVal < 1e-7 ? "0 (idénticos)" : diffVal.toFixed(6)}</span>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">Decimales tecleados</span>
              <span className="text-hw-cyan font-bold">{precision}</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={precision}
              disabled={!canControl}
              onChange={(e) => onUpdateParam("precision", parseInt(e.target.value))}
              className={`w-full h-1 bg-hw-border appearance-none cursor-pointer outline-none accent-hw-cyan ${
                !canControl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
            <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed font-mono">
              Lorenz copió <b className="text-gray-400">3 decimales</b> de la impresión. Súbelo a 6 y los dos pronósticos se vuelven idénticos.
            </p>
          </div>
        </div>

        {/* Parámetros Atmósfera */}
        <div className="border border-hw-border bg-hw-panel/40 p-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold mb-3">
            // LA ATMÓSFERA SIMULADA
          </h2>
          <div className="flex flex-col">
            <div className="flex justify-between items-baseline text-xs mb-1.5 font-mono">
              <span className="text-white uppercase tracking-wider text-[11px]">ρ · turbulencia</span>
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
            <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed font-mono">
              Baja a ~20 y la atmósfera se calma: el redondeo deja de importar y los pronósticos coinciden.
            </p>
          </div>
        </div>

        {/* Simulación */}
        <div className="border border-hw-border bg-hw-panel/40 p-4">
          <h2 className="text-[11px] font-mono tracking-widest uppercase text-hw-cyan font-bold mb-3">
            // CONTROLES DE PRONÓSTICO
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
        </div>

        {!canControl && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 text-[10px] text-center font-mono uppercase tracking-wider leading-relaxed">
            🔒 CONTROL BLOQUEADO POR PRESENTADOR
          </div>
        )}

        <p className="text-[10px] text-gray-500 leading-relaxed font-mono mt-auto pt-4">
          Modelo de convección de Lorenz. Se grafica una variable atmosférica (<b>x</b>) en el tiempo: el "clima" del pronóstico.
        </p>
      </aside>

      {/* ---------- VISTA (CANVAS) ---------- */}
      <section ref={containerRef} className="relative w-full h-full bg-hw-bg min-h-0 flex flex-col justify-end">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Lector de Horizonte */}
        <div className="absolute top-5 right-5 w-[240px] md:w-[260px] bg-hw-panel/95 backdrop-blur-md border border-hw-border p-4 z-10">
          <div className="text-[11px] tracking-widest uppercase text-gray-500 font-bold font-mono mb-1.5">
            // HORIZONTE DE PREDICCIÓN
          </div>
          <div
            className={`text-3xl font-mono font-bold tracking-tight leading-none ${
              divergedAt !== null ? "text-red-500" : "text-hw-cyan"
            }`}
          >
            {divergedAt !== null ? `${Math.round(divergedAt)} DÍAS` : "ESTABLE"}
          </div>
          <div className="text-xs text-gray-400 mt-2.5 leading-relaxed min-h-[32px] font-mono">
            {divergedAt !== null
              ? "Más allá de aquí, el pronóstico redondeado no se parece en nada al real."
              : precision >= 6
              ? "Con 6 decimales, los pronósticos son idénticos."
              : "Los dos pronósticos aún coinciden…"}
          </div>
          <div className="flex flex-col gap-1.5 mt-3 border-t border-hw-border pt-3 text-[10.5px] font-mono uppercase">
            <span className="flex items-center gap-2 text-gray-400">
              <span className="w-3 h-3 bg-hw-cyan" /> original (6 decs)
            </span>
            <span className="flex items-center gap-2 text-gray-400">
              <span className="w-3 h-3 bg-hw-amber" /> re-corrido ({precision} decs)
            </span>
          </div>
        </div>

        <div className="absolute bottom-3 left-5 font-mono text-[10.5px] text-gray-500">
          eje horizontal = días de pronóstico →
        </div>
      </section>
    </div>
  );
}
