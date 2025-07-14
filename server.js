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
    knockback: { x: 0, y: 0 },
    wasHit: false,
    id: null,
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
  function intersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
    if (!d) return false;
    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / d;
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / d;
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  return (
    intersect(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
    intersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
    intersect(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) ||
    intersect(x1, y1, x2, y2, rx, ry + rh, rx, ry)
  );
}

io.on("connection", (socket) => {
  socket.on("host", ({ color }) => {
    const code = generateCode();
    const player = createPlayer(color);
    player.id = socket.id;
    rooms[code] = { hostId: socket.id, players: { [socket.id]: player }, started: false };
    socket.join(code);
    socket.emit("init", { id: socket.id, isHost: true, code });
  });

  socket.on("join", ({ color, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit("invalidCode");
    if (Object.keys(room.players).length >= 2) return socket.emit("full");

    const player = createPlayer(color);
    player.id = socket.id;
    room.players[socket.id] = player;
    socket.join(code);
    socket.emit("init", { id: socket.id, isHost: false, code });
    io.to(room.hostId).emit("playerJoined");
  });

  socket.on("start", ({ code }) => {
    if (rooms[code]?.hostId === socket.id) {
      rooms[code].started = true;
      for (let id in rooms[code].players) {
        rooms[code].players[id].health = 100;
        rooms[code].players[id].wasHit = false;
      }
      io.to(code).emit("startGame");
    }
  });

  socket.on("kick", ({ code }) => {
    const room = rooms[code];
    if (!room || socket.id !== room.hostId) return;
    for (let id in room.players) {
      if (id !== room.hostId) {
        io.to(id).emit("kicked");
        delete room.players[id];
        io.sockets.sockets.get(id)?.leave(code);
      }
    }
  });

  socket.on("attack", ({ code }) => {
    const room = rooms[code];
    const attacker = room?.players[socket.id];
    if (!attacker || !room.started) return;

    const x1 = attacker.x + 25;
    const y1 = attacker.y + 25;
    const x2 = x1 + Math.cos(attacker.angle) * 100;
    const y2 = y1 + Math.sin(attacker.angle) * 100;

    for (let id in room.players) {
      if (id === socket.id) continue;
      const target = room.players[id];
      const hit = lineIntersectsRect(x1, y1, x2, y2, target.x, target.y, 50, 50);
      if (hit && !target.wasHit) {
        target.health = Math.max(0, target.health - 10);
        target.knockback.x += Math.cos(attacker.angle) * 3;
        target.knockback.y += Math.sin(attacker.angle) * 3;
        target.wasHit = true;
      } else if (!hit) {
        target.wasHit = false;
      }

      if (target.health <= 0) {
        io.to(code).emit("gameOver", { winner: socket.id, loser: id });
        room.started = false;
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

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        socket.leave(code);
        if (socket.id === room.hostId || Object.keys(room.players).length === 0) {
          io.to(code).emit("kicked");
          delete rooms[code];
        }
        break;
      }
    }
  });
});

// Game loop
setInterval(() => {
  for (let code in rooms) {
    const room = rooms[code];
    for (let id in room.players) {
      const p = room.players[id];
      if (p.keys.w) p.y -= 5;
      if (p.keys.s) p.y += 5;
      if (p.keys.a) p.x -= 5;
      if (p.keys.d) p.x += 5;

      // Knockback
      p.x += p.knockback.x;
      p.y += p.knockback.y;
      p.knockback.x *= 0.9;
      p.knockback.y *= 0.9;

      // Wrap border
      if (p.x < -50) p.x = 850;
      if (p.x > 850) p.x = -50;
      if (p.y < -50) p.y = 650;
      if (p.y > 650) p.y = -50;
    }

    io.to(code).emit("state", room.players);
  }
}, 1000 / 60);

// ✅ Use web-friendly port for Railway / Fly.io / Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
