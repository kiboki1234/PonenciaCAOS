import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Estructura del estado compartido
interface SharedState {
  activeTab: 'clima' | 'atractor';
  controlMode: 'presenter_only' | 'collaborative';
  clima: {
    precision: number;
    rho: number;
    speed: number;
    playing: boolean;
    resetCounter: number; // Incrementado para gatillar reinicio en los clientes
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
    resetCounter: number; // Incrementado para gatillar reinicio en los clientes
  };
}

// Estado inicial por defecto
const state: SharedState = {
  activeTab: 'clima',
  controlMode: 'presenter_only',
  clima: {
    precision: 3,
    rho: 28.0,
    speed: 1.0,
    playing: true,
    resetCounter: 0,
  },
  atractor: {
    eps: 1e-5,
    epsIndex: -5,
    x0: 1.0,
    rho: 28.0,
    sigma: 10.0,
    beta: 2.67,
    speed: 1.0,
    playing: true,
    autoRotate: true,
    resetCounter: 0,
  }
};

// Crear servidor HTTP
const server = http.createServer(app);

// Crear servidor WebSocket
const wss = new WebSocketServer({ noServer: true });

// Almacenar metadatos de los clientes conectados
interface ClientMeta {
  ws: WebSocket;
  role: 'presenter' | 'audience';
  isAlive: boolean;
}

const clients = new Set<ClientMeta>();

// Contraseña para reclamar rol de Presentador
const PRESENTER_PASSCODE = "caos";

// Verificar si hay algún presentador activo en este momento
function hasActivePresenter(): boolean {
  for (const client of clients) {
    if (client.role === 'presenter') return true;
  }
  return false;
}

// Enviar estado actual a un cliente específico
function sendStateTo(ws: WebSocket) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'state',
      state
    }));
  }
}

// Difundir estado a todos los clientes conectados
function broadcastState() {
  const payload = JSON.stringify({
    type: 'state',
    state
  });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// Difundir contador de conectados a todos
function broadcastPresence() {
  const payload = JSON.stringify({
    type: 'presence',
    count: clients.size
  });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// Manejar la actualización de parámetros
function handleUpdate(clientMeta: ClientMeta, demo: 'clima' | 'atractor', key: string, value: any) {
  // Verificar permisos: si está en modo "presenter_only", solo el presentador puede modificar
  if (state.controlMode === 'presenter_only' && clientMeta.role !== 'presenter') {
    return; // Rechazado silenciosamente
  }

  if (demo === 'clima') {
    const c = state.clima as any;
    if (c[key] !== undefined) {
      c[key] = value;
    }
  } else if (demo === 'atractor') {
    const a = state.atractor as any;
    if (a[key] !== undefined) {
      a[key] = value;
    }
  }
  broadcastState();
}

// Manejar acciones de control (play, pause, reset)
function handleControl(clientMeta: ClientMeta, demo: 'clima' | 'atractor', action: string) {
  if (state.controlMode === 'presenter_only' && clientMeta.role !== 'presenter') {
    return; // Sin permisos
  }

  const d = demo === 'clima' ? state.clima : state.atractor;

  if (action === 'play') {
    d.playing = true;
  } else if (action === 'pause') {
    d.playing = false;
  } else if (action === 'reset') {
    d.resetCounter += 1;
  }
  broadcastState();
}

// Configurar WebSockets
wss.on('connection', (ws) => {
  const clientMeta: ClientMeta = {
    ws,
    role: 'audience',
    isAlive: true
  };
  clients.add(clientMeta);

  // Enviar estado inicial y presencia actualizada de inmediato
  sendStateTo(ws);
  broadcastPresence();

  // Escuchar pings del cliente para mantener viva la conexión
  ws.on('pong', () => {
    clientMeta.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'join':
          // El cliente se une y especifica su rol deseado
          if (data.role === 'presenter') {
            // Se le concede el rol si no hay presentador activo,
            // o si provee el código correcto
            const canBePresenter = !hasActivePresenter() || data.passcode === PRESENTER_PASSCODE;
            if (canBePresenter) {
              clientMeta.role = 'presenter';
              ws.send(JSON.stringify({ type: 'role_granted', role: 'presenter' }));
            } else {
              clientMeta.role = 'audience';
              ws.send(JSON.stringify({ type: 'role_granted', role: 'audience', error: 'Passcode incorrecto o sala ocupada' }));
            }
          } else {
            clientMeta.role = 'audience';
            ws.send(JSON.stringify({ type: 'role_granted', role: 'audience' }));
          }
          broadcastPresence();
          break;

        case 'tab':
          // Cambiar de pestaña (solo presentador o todos en modo colaborativo)
          if (state.controlMode === 'presenter_only' && clientMeta.role !== 'presenter') break;
          if (data.value === 'clima' || data.value === 'atractor') {
            state.activeTab = data.value;
            broadcastState();
          }
          break;

        case 'mode':
          // Cambiar modo de control (SÓLO el presentador puede cambiar el modo global)
          if (clientMeta.role === 'presenter') {
            if (data.value === 'presenter_only' || data.value === 'collaborative') {
              state.controlMode = data.value;
              broadcastState();
            }
          }
          break;

        case 'update':
          // { type: 'update', demo: 'clima'|'atractor', key: string, value: any }
          if (data.demo && data.key && data.value !== undefined) {
            handleUpdate(clientMeta, data.demo, data.key, data.value);
          }
          break;

        case 'control':
          // { type: 'control', demo: 'clima'|'atractor', action: 'play'|'pause'|'reset' }
          if (data.demo && data.action) {
            handleControl(clientMeta, data.demo, data.action);
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (e) {
      console.error("Error procesando mensaje websocket:", e);
    }
  });

  ws.on('close', () => {
    clients.delete(clientMeta);
    broadcastPresence();
  });

  ws.on('error', () => {
    clients.delete(clientMeta);
    broadcastPresence();
  });
});

// Intervalo para verificar conexiones inactivas (Heartbeat)
const pingInterval = setInterval(() => {
  for (const client of clients) {
    if (!client.isAlive) {
      client.ws.terminate();
      clients.delete(client);
      continue;
    }
    client.isAlive = false;
    client.ws.ping();
  }
  broadcastPresence();
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Manejo de la actualización HTTP a WebSocket en el servidor
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Rutas de API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", clients: clients.size, activeTab: state.activeTab, controlMode: state.controlMode });
});

// Ruta para restablecer estado por completo (útil si se atasca)
app.post("/api/reset-state", (req, res) => {
  state.activeTab = 'clima';
  state.controlMode = 'presenter_only';
  state.clima.precision = 3;
  state.clima.rho = 28.0;
  state.clima.speed = 1.0;
  state.clima.playing = true;
  state.clima.resetCounter += 1;
  state.atractor.eps = 1e-5;
  state.atractor.epsIndex = -5;
  state.atractor.x0 = 1.0;
  state.atractor.rho = 28.0;
  state.atractor.sigma = 10.0;
  state.atractor.beta = 2.67;
  state.atractor.speed = 1.0;
  state.atractor.playing = true;
  state.atractor.autoRotate = true;
  state.atractor.resetCounter += 1;
  
  broadcastState();
  res.json({ status: "state_reset" });
});

// Inicializar Vite o servir archivos estáticos compilados
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Configuración de desarrollo con Vite en middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Configuración para producción: servir archivos compilados en /dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`=== LORENZ CHAOS SIMULATION SERVER RUNNING ===`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Port binding is hardcoded to ${PORT} for container ingress.`);
  });
}

startServer();
