const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

function createPlayer(color) {
  return {
    x: Math.random() * 600 + 100,
    y: 300,
    angle: 0,
    color,
    keys: {},
    health: 100,
  };
}

function generateCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms[code]);
  return code;
}

function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;
  function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (!d) return false;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / d;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / d;
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }
  // edges
  if (intersect(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  if (intersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;
  if (intersect(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh)) return true;
  if (intersect(x1, y1, x2, y2, rx, ry + rh, rx, ry)) return true;
  return false;
}

io.on("connection", (socket) => {
  socket.on("host", ({ color }) => {
    const code = generateCode();
    rooms[code] = { hostId: socket.id, players: {} };
    rooms[code].players[socket.id] = createPlayer(color);
    socket.join(code);
    socket.emit("init", { id: socket.id, isHost: true, code });
  });

  socket.on("join", ({ color, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit("invalidCode");
    if (Object.keys(room.players).length >= 2) return socket.emit("full");
    room.players[socket.id] = createPlayer(color);
    socket.join(code);
    socket.emit("init", { id: socket.id, isHost: false, code });
    io.to(room.hostId).emit("playerJoined");
  });

  socket.on("start", ({ code }) => {
    if (rooms[code]?.hostId === socket.id) io.to(code).emit("startGame");
  });

  socket.on("kick", ({ code }) => {
    const room = rooms[code];
    if (room?.hostId === socket.id) {
      for (let id in room.players) {
        if (id !== room.hostId) {
          io.to(id).emit("kicked");
          delete room.players[id];
          io.sockets.sockets.get(id)?.leave(code);
        }
      }
    }
  });

  socket.on("keydown", ({ key, code }) => {
    const p = rooms[code]?.players[socket.id];
    if (p) p.keys[key] = true;
  });
  socket.on("keyup", ({ key, code }) => {
    const p = rooms[code]?.players[socket.id];
    if (p) p.keys[key] = false;
  });

  socket.on("attack", ({ code }) => {
    const room = rooms[code];
    const attacker = room?.players[socket.id];
    if (!attacker) return;
    const x1 = attacker.x + 25,
      y1 = attacker.y + 25;
    const x2 = x1 + Math.cos(attacker.angle) * 40;
    const y2 = y1 + Math.sin(attacker.angle) * 40;

    for (let id in room.players) {
      if (id === socket.id) continue;
      const t = room.players[id];
      if (lineIntersectsRect(x1, y1, x2, y2, t.x, t.y, 50, 50)) {
        t.health = Math.max(0, t.health - 10);
      }
    }
  });

  socket.on("disconnect", () => {
    for (let code in rooms) {
      const r = rooms[code];
      if (r.players[socket.id]) {
        delete r.players[socket.id];
        socket.leave(code);
        if (socket.id === r.hostId || !Object.keys(r.players).length) {
          io.to(code).emit("kicked");
          delete rooms[code];
        }
        break;
      }
    }
  });
});

// Update loop
setInterval(() => {
  for (let code in rooms) {
    const room = rooms[code];
    for (let id in room.players) {
      const p = room.players[id];
      if (p.keys.w) p.y -= 5;
      if (p.keys.s) p.y += 5;
      if (p.keys.a) p.x -= 5;
      if (p.keys.d) p.x += 5;
      if (p.keys.ArrowLeft) p.angle -= 0.1;
      if (p.keys.ArrowRight) p.angle += 0.1;
    }
    io.to(code).emit("state", room.players);
  }
}, 1000 / 60);

// Listen on dynamic port (for Railway) or fallback to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
