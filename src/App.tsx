import { useEffect, useRef, useState } from "react";
import { Users, Wifi, WifiOff, Tv, Shield, ShieldAlert, Sparkles, Lock, Unlock, Compass } from "lucide-react";
import ClimaDemo from "./components/ClimaDemo";
import AtractorDemo from "./components/AtractorDemo";
import PresenterPanel from "./components/PresenterPanel";

// Estructura idéntica al backend para tipado
interface SharedState {
  activeTab: 'clima' | 'atractor';
  controlMode: 'presenter_only' | 'collaborative';
  clima: {
    precision: number;
    rho: number;
    speed: number;
    playing: boolean;
    resetCounter: number;
  };
  atractor: {
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
  };
}

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const throttleMap = useRef<Record<string, NodeJS.Timeout | null>>({});

  // Estados locales sincronizados
  const [sharedState, setSharedState] = useState<SharedState | null>(null);
  const [clientsCount, setClientsCount] = useState<number>(1);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [role, setRole] = useState<'presenter' | 'audience'>('audience');
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showPresenterSidebar, setShowPresenterSidebar] = useState<boolean>(false);

  // Determinar si estamos en la ruta de presentador
  const isPresenterPath = window.location.pathname.startsWith("/presenter");

  // Conectar WebSocket con política de reconexión automática con backoff
  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log(`Intentando conectar a WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket conectado con éxito.");
      setIsConnected(true);
      setErrorMsg("");

      // Si estamos en la ruta /presenter, reclamamos el rol automáticamente
      if (isPresenterPath) {
        ws.send(JSON.stringify({
          type: "join",
          role: "presenter"
        }));
      } else {
        ws.send(JSON.stringify({
          type: "join",
          role: "audience"
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "state":
            setSharedState(data.state);
            break;
          case "presence":
            setClientsCount(data.count);
            break;
          case "role_granted":
            setRole(data.role);
            if (data.role === "presenter") {
              setShowPresenterSidebar(true);
            }
            if (data.error) {
              setErrorMsg(data.error);
            }
            break;
          case "pong":
            // Latido de vuelta
            break;
        }
      } catch (err) {
        console.error("Error al parsear mensaje de WebSocket:", err);
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket cerrado. Código: ${event.code}. Reconectando...`);
      setIsConnected(false);
      // Intentar reconectar tras un delay de backoff simple (3 segundos)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error("Error en WebSocket:", err);
      ws.close();
    };
  };

  useEffect(() => {
    connectWebSocket();

    // Mantener la conexión activa enviando pings periódicos
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);

    return () => {
      clearInterval(pingInterval);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Función para enviar cambios de parámetros con control de Throttle (25ms)
  const handleUpdateParam = (key: string, value: any) => {
    if (!sharedState) return;
    const demo = sharedState.activeTab;

    // Actualización local inmediata (Optimistic Update) para una interfaz fluida
    setSharedState((prev) => {
      if (!prev) return null;
      const copy = { ...prev };
      if (demo === "clima") {
        (copy.clima as any)[key] = value;
      } else {
        (copy.atractor as any)[key] = value;
      }
      return copy;
    });

    // Enviar al servidor con debounce/throttle
    const throttleKey = `${demo}:${key}`;
    if (throttleMap.current[throttleKey]) {
      clearTimeout(throttleMap.current[throttleKey]!);
    }

    throttleMap.current[throttleKey] = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "update",
            demo,
            key,
            value,
          })
        );
      }
      throttleMap.current[throttleKey] = null;
    }, 25);
  };

  // Función para enviar acciones de control directas (play, pause, reset)
  const handleControlAction = (action: "play" | "pause" | "reset") => {
    if (!sharedState) return;
    const demo = sharedState.activeTab;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          demo,
          action,
        })
      );
    }
  };

  // Cambiar pestaña activa de simulación
  const handleTabChange = (tab: "clima" | "atractor") => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "tab",
          value: tab,
        })
      );
    }
  };

  // Cambiar modo de control global (SÓLO Presentador)
  const handleUpdateControlMode = (mode: "presenter_only" | "collaborative") => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "mode",
          value: mode,
        })
      );
    }
  };

  // Acción de reinicio global por el presentador
  const handleGlobalReset = async () => {
    try {
      await fetch("/api/reset-state", { method: "POST" });
    } catch (e) {
      console.error("Error al restablecer el estado global:", e);
    }
  };

  // Reclamar contraseña de presentador
  const handleClaimPresenter = (passcode: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join",
          role: "presenter",
          passcode,
        })
      );
    }
  };

  // Determinar si el usuario actual puede interactuar con los sliders
  const isPresenter = role === "presenter";
  const canControl = sharedState?.controlMode === "collaborative" || isPresenter;

  if (!sharedState) {
    return (
      <div className="fixed inset-0 bg-[#070b14] flex flex-col items-center justify-center text-white p-5 select-none">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-t-[#3fe0c5] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <Sparkles className="w-5 h-5 text-[#3fe0c5] absolute" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold tracking-tight">Sincronizando Simulación...</h1>
            <p className="text-xs text-[#7c89a6] max-w-xs">
              Conectando con el servidor en tiempo real. Prepara tus sentidos para el efecto mariposa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isClima = sharedState.activeTab === "clima";

  return (
    <div className="relative flex flex-col h-screen w-screen bg-hw-bg text-[#e0e0e0] overflow-hidden font-sans">
      {/* ---------- HEADER GENERAL ---------- */}
      <header className="flex items-center justify-between bg-hw-panel border-b border-hw-border px-6 py-3 z-20 select-none shrink-0">
        <div className="flex items-center gap-6">
          <div className="font-mono text-sm md:text-base font-bold tracking-widest text-white">
            <span className="text-hw-cyan mr-1.5">//</span> LORENZ SYNC PLATFORM
          </div>
          <div className="status-badge flex items-center bg-hw-cyan/10 px-3 py-1 border border-hw-cyan rounded-md text-hw-cyan text-[11px] font-bold tracking-wider">
            <div className="status-dot w-2 h-2 bg-hw-cyan rounded-full mr-2 glow-dot" />
            <span className="hidden sm:inline">SESIÓN EN VIVO: </span>TEORÍA DEL CAOS
          </div>
        </div>

        {/* SELECTOR DE PESTAÑAS SINCRONIZADO */}
        <div className="flex bg-hw-border border border-hw-border">
          <button
            onClick={() => (canControl ? handleTabChange("clima") : null)}
            disabled={!canControl}
            className={`px-4 py-1.5 text-[11px] uppercase tracking-wider transition cursor-pointer font-bold ${
              isClima
                ? "bg-hw-cyan text-hw-bg font-bold"
                : "bg-hw-panel text-gray-400 hover:text-white"
            } ${!canControl ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Clima 1961
          </button>
          <button
            onClick={() => (canControl ? handleTabChange("atractor") : null)}
            disabled={!canControl}
            className={`px-4 py-1.5 text-[11px] uppercase tracking-wider transition cursor-pointer font-bold ${
              !isClima
                ? "bg-hw-cyan text-hw-bg font-bold"
                : "bg-hw-panel text-gray-400 hover:text-white"
            } ${!canControl ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Atractor 1963
          </button>
        </div>

        {/* INFORMACIÓN DE CONEXIÓN */}
        <div className="flex items-center gap-3">
          {/* Indicador de rol */}
          <span
            className={`text-[10px] uppercase font-mono font-bold px-2.5 py-0.5 rounded border ${
              isPresenter
                ? "bg-hw-cyan/10 border-hw-cyan/30 text-hw-cyan"
                : "bg-hw-panel border-hw-border text-gray-400"
            }`}
          >
            {isPresenter ? "Presentador" : "Público"}
          </span>

          {/* Botón de panel si es presentador o está en ruta /presenter */}
          {(isPresenter || isPresenterPath) && (
            <button
              onClick={() => setShowPresenterSidebar(!showPresenterSidebar)}
              className={`text-[11px] font-mono font-bold px-3 py-1 rounded border transition cursor-pointer flex items-center gap-1.5 ${
                showPresenterSidebar
                  ? "bg-hw-cyan text-hw-bg border-hw-cyan"
                  : "bg-hw-panel text-white border-hw-border hover:bg-[#1f1f1f]"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>PONENCIA</span>
            </button>
          )}

          {/* Contador de conectados */}
          <div className="flex items-center gap-2 bg-hw-panel border border-hw-border px-3 py-1 rounded text-[11px] font-mono font-bold text-hw-cyan">
            <Users className="w-3.5 h-3.5" />
            <span>{clientsCount}</span>
            <span className="text-gray-500 text-[10px]">CONECTADOS</span>
          </div>

          {/* Estado de red */}
          <div
            className={`flex items-center justify-center p-1.5 rounded ${
              isConnected ? "text-hw-cyan bg-hw-cyan/5" : "text-red-500 bg-red-500/10"
            }`}
            title={isConnected ? "Conectado al servidor de sincronización" : "Desconectado. Reconectando..."}
          >
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-pulse" />}
          </div>
        </div>
      </header>

      {/* ---------- ÁREA PRINCIPAL ---------- */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        <div className="flex-1 h-full min-w-0 relative">
          {isClima ? (
            <ClimaDemo
              precision={sharedState.clima.precision}
              rho={sharedState.clima.rho}
              speed={sharedState.clima.speed}
              playing={sharedState.clima.playing}
              resetCounter={sharedState.clima.resetCounter}
              canControl={canControl}
              onUpdateParam={handleUpdateParam}
              onControlAction={handleControlAction}
            />
          ) : (
            <AtractorDemo
              eps={sharedState.atractor.eps}
              epsIndex={sharedState.atractor.epsIndex}
              x0={sharedState.atractor.x0}
              rho={sharedState.atractor.rho}
              sigma={sharedState.atractor.sigma}
              beta={sharedState.atractor.beta}
              speed={sharedState.atractor.speed}
              playing={sharedState.atractor.playing}
              autoRotate={sharedState.atractor.autoRotate}
              resetCounter={sharedState.atractor.resetCounter}
              canControl={canControl}
              onUpdateParam={handleUpdateParam}
              onControlAction={handleControlAction}
            />
          )}
        </div>

        {/* ---------- LATERAL PANEL PRESENTADOR (COLAPSIBLE) ---------- */}
        {showPresenterSidebar && (
          <div className="absolute right-0 top-0 bottom-0 z-30 w-full max-w-sm border-l border-hw-border bg-hw-bg/95 backdrop-blur-md p-4 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-hw-border select-none">
              <span className="text-[11px] font-mono text-[#888] uppercase tracking-wider">Centro de Control</span>
              <button
                onClick={() => setShowPresenterSidebar(false)}
                className="text-xs text-[#ff5d6c] hover:text-[#ff3c4d] font-semibold cursor-pointer font-mono"
              >
                CERRAR PANEL
              </button>
            </div>
            <PresenterPanel
              clientsCount={clientsCount}
              controlMode={sharedState.controlMode}
              isPresenter={isPresenter}
              onUpdateControlMode={handleUpdateControlMode}
              onGlobalReset={handleGlobalReset}
              onClaimPresenter={handleClaimPresenter}
              errorMsg={errorMsg}
            />
          </div>
        )}
      </div>

      {/* ---------- MENSAJE DE ESTADO DE CONTROL ---------- */}
      <footer className="bg-hw-panel border-t border-hw-border py-2 px-6 flex justify-between items-center text-[11px] font-mono select-none shrink-0 text-[#888]">
        <div className="flex items-center gap-1.5">
          {sharedState.controlMode === "presenter_only" ? (
            <>
              <Shield className="w-3.5 h-3.5 text-hw-cyan" />
              <span>SALA: <span className="text-hw-cyan">SOLO PRESENTADOR (MODO LECTURA ACTIVO)</span></span>
            </>
          ) : (
            <>
              <Compass className="w-3.5 h-3.5 text-hw-amber animate-spin" style={{ animationDuration: "8s" }} />
              <span>SALA: <span className="text-hw-amber">CAOS COMPARTIDO // COLABORATIVO</span></span>
            </>
          )}
        </div>
        <div className="hidden md:block">
          ESTADO: SINCRONIZADO // BROADCAST ACTIVO
        </div>
        <div className="hidden sm:block text-gray-600">
          RK4 PHYSICS ENGINE // V1.0
        </div>
      </footer>
    </div>
  );
}
