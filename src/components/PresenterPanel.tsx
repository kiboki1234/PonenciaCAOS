import { useState, useEffect } from "react";
import { QrCode, Users, Shield, ShieldAlert, RotateCcw, Link2, Check, Lock, Unlock, Compass } from "lucide-react";

interface PresenterPanelProps {
  clientsCount: number;
  controlMode: 'presenter_only' | 'collaborative';
  isPresenter: boolean;
  onUpdateControlMode: (mode: 'presenter_only' | 'collaborative') => void;
  onGlobalReset: () => void;
  onClaimPresenter: (passcode: string) => void;
  errorMsg: string;
}

export default function PresenterPanel({
  clientsCount,
  controlMode,
  isPresenter,
  onUpdateControlMode,
  onGlobalReset,
  onClaimPresenter,
  errorMsg,
}: PresenterPanelProps) {
  const [passcode, setPasscode] = useState("");
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    // Obtener la URL base del navegador actual
    const base = window.location.origin;
    setAppUrl(base);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=ffffff&bgcolor=050505&data=${encodeURIComponent(
    appUrl
  )}`;

  return (
    <div className="bg-hw-panel border border-hw-border p-5 shadow-2xl flex flex-col gap-5 w-full max-w-md mx-auto text-[#e0e0e0] select-none">
      {/* Cabecera del Panel */}
      <div className="flex items-center gap-3 border-b border-hw-border pb-4">
        <div className="p-2 bg-hw-cyan/10 rounded text-hw-cyan border border-hw-cyan/30">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-white">// PANEL DE PONENCIA</h2>
          <p className="text-xs text-gray-400 font-mono">Controles globales de la ponencia en vivo</p>
        </div>
      </div>

      {/* Autenticación si no es Presentador */}
      {!isPresenter ? (
        <div className="bg-hw-bg border border-hw-border p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-red-500 font-bold font-mono uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>Controles Bloqueados</span>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed font-mono">
            Ingresa la contraseña del presentador para reclamar el control y poder proyectar/gestionar la simulación.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Contraseña (e.g. caos)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="flex-1 bg-hw-panel border border-hw-border px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-hw-cyan font-mono"
            />
            <button
              onClick={() => onClaimPresenter(passcode)}
              className="bg-hw-cyan hover:bg-[#25bca8] text-hw-bg text-xs font-mono font-bold px-4 py-1.5 transition cursor-pointer uppercase"
            >
              Acceder
            </button>
          </div>
          {errorMsg && <p className="text-[10px] text-red-400 font-mono">{errorMsg}</p>}
        </div>
      ) : (
        <div className="bg-hw-cyan/5 border border-hw-cyan/20 p-3.5 flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-hw-cyan" />
            <span className="text-xs font-bold text-hw-cyan uppercase tracking-wider">Presentador Activo</span>
          </div>
          <span className="text-[10px] bg-hw-cyan/15 text-hw-cyan px-2.5 py-0.5 font-mono uppercase">
            Código: caos
          </span>
        </div>
      )}

      {/* Indicadores Clave */}
      <div className="grid grid-cols-2 gap-3">
        {/* Espectadores */}
        <div className="bg-hw-bg border border-hw-border p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-gray-500 font-mono">
            <span className="text-[10px] uppercase font-bold tracking-wider">Conectados</span>
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1">{clientsCount}</div>
          <span className="text-[9px] text-gray-600 font-mono uppercase">Dispositivos en vivo</span>
        </div>

        {/* Modo de Control */}
        <div className="bg-hw-bg border border-hw-border p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-gray-500 font-mono">
            <span className="text-[10px] uppercase font-bold tracking-wider">Control actual</span>
            {controlMode === "presenter_only" ? (
              <Shield className="w-3.5 h-3.5 text-hw-cyan" />
            ) : (
              <Compass className="w-3.5 h-3.5 text-hw-amber" />
            )}
          </div>
          <div
            className={`text-[11px] font-mono font-bold mt-2 truncate uppercase ${
              controlMode === "presenter_only" ? "text-hw-cyan" : "text-hw-amber"
            }`}
          >
            {controlMode === "presenter_only" ? "Solo Ponente" : "Colaborativo"}
          </div>
          <span className="text-[9px] text-gray-600 font-mono uppercase">
            {controlMode === "presenter_only" ? "Público observa" : "Todos manipulan"}
          </span>
        </div>
      </div>

      {/* Acciones de Presentador */}
      {isPresenter && (
        <div className="flex flex-col gap-3 bg-hw-bg border border-hw-border p-4">
          <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1 font-mono">
            // GESTIÓN DE LA PONENCIA
          </h3>

          {/* Toggle de Modo */}
          <div className="flex flex-col gap-1.5 font-mono">
            <span className="text-xs text-gray-400">Modo de interacción:</span>
            <div className="flex p-0.5 bg-hw-panel border border-hw-border">
              <button
                onClick={() => onUpdateControlMode("presenter_only")}
                className={`flex-1 text-[11px] py-1.5 font-mono font-bold transition cursor-pointer uppercase ${
                  controlMode === "presenter_only"
                    ? "bg-hw-cyan text-hw-bg"
                    : "hover:bg-white/5 text-gray-400"
                }`}
              >
                🔒 SOLO YO
              </button>
              <button
                onClick={() => onUpdateControlMode("collaborative")}
                className={`flex-1 text-[11px] py-1.5 font-mono font-bold transition cursor-pointer uppercase ${
                  controlMode === "collaborative"
                    ? "bg-hw-amber text-hw-bg"
                    : "hover:bg-white/5 text-gray-400"
                }`}
              >
                🌀 TODOS (CAOS)
              </button>
            </div>
          </div>

          {/* Botones de Control Maestro */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={onGlobalReset}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 text-xs font-mono font-bold py-2 px-3 transition cursor-pointer uppercase"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resetear Sala
            </button>
          </div>
        </div>
      )}

      {/* Proyección QR para unir al público */}
      <div className="bg-hw-bg border border-hw-border p-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 font-bold font-mono w-full uppercase">
          <QrCode className="w-4 h-4 text-hw-cyan" />
          <span>Proyectar Acceso Público</span>
        </div>

        {/* QR Generado */}
        {appUrl && (
          <div className="bg-hw-panel border border-hw-border p-2.5 flex items-center justify-center">
            <img src={qrUrl} alt="Escanear QR para unirse" className="w-36 h-36" referrerPolicy="no-referrer" />
          </div>
        )}

        {/* URL y Botón de Copiar */}
        <div className="flex items-center gap-2 bg-hw-panel border border-hw-border px-2.5 py-1.5 w-full">
          <span className="text-[10px] text-gray-400 font-mono truncate flex-1">{appUrl || "Cargando URL..."}</span>
          <button
            onClick={handleCopy}
            className="text-hw-cyan hover:text-[#25bca8] p-1 transition cursor-pointer"
            title="Copiar enlace"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[9.5px] text-gray-600 text-center leading-relaxed font-mono uppercase">
          Pide al público que escanee el QR o use este enlace para seguir la simulación en tiempo real desde sus móviles.
        </p>
      </div>
    </div>
  );
}
