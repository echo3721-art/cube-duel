const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files (like HTML, CSS, JS) from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

// Function to create a new player
function createPlayer(color) {
  return {
    x: Math.random() * 600 + 100, // Random starting position
    y: 300,
    angle: 0,
    color,
    keys: {}, // stores the key states (W, A, S, D, Arrow keys, etc.)
    health: 100,
  };
}

// Function to generate a unique game code (4-digit)
function generateCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000)); // Random 4-digit number
  } while (rooms[code]); // Ensure it's unique
  return code;
}

// Function to check if a line intersects a rectangle
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

  // Check for intersection with each side of the rectangle
  if (intersect(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  if (intersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;
  if (intersect(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh)) return true;
  if (intersect(x1, y1, x2, y2, rx, ry + rh, rx, ry)) return true;
  return false;
}

io.on("connection", (socket) => {
  // Host a new game
  socket.on("host", ({ color }) => {
    const code = generateCode();
    rooms[code] = { hostId: socket.id, players: {} };
    rooms[code].players[socket.id] = createPlayer(color);
    socket.join(code); // Join the room
    socket.emit("init", { id: socket.id, isHost: true, code });
  });

  // Join an existing game
  socket.on("join", ({ color, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit("invalidCode"); // Room does not exist
    if (Object.keys(room.players).length >= 2) return socket.emit("full"); // Room is full
    room.players[socket.id] = createPlayer(color);
    socket.join(code); // Join the room
    socket.emit("init", { id: socket.id, isHost: false, code });
    io.to(room.hostId).emit("playerJoined"); // Notify host that a player joined
  });

  // Start the game
  socket.on("start", ({ code }) => {
    if (rooms[code]?.hostId === socket.id) {
      io.to(code).emit("startGame"); // Notify all players in the room
    }
  });

  // Host can kick a player
  socket.on("kick", ({ code }) => {
    const room = rooms[code];
    if (room?.hostId === socket.id) {
      for (let id in room.players) {
        if (id !== room.hostId) {
          io.to(id).emit("kicked"); // Notify player that they were kicked
          delete room.players[id]; // Remove player from the room
          io.sockets.sockets.get(id)?.leave(code); // Disconnect player from room
        }
      }
    }
  });

  // Handle key events for player movement and rotation
  socket.on("keydown", ({ key, code }) => {
    const p = rooms[code]?.players[socket.id];
    if (p) p.keys[key] = true;
  });

  socket.on("keyup", ({ key, code }) => {
    const p = rooms[code]?.players[socket.id];
    if (p) p.keys[key] = false;
  });

  // Handle attack events
  socket.on("attack", ({ code }) => {
    const room = rooms[code];
    const attacker = room?.players[socket.id];
    if (!attacker) return;
    const x1 = attacker.x + 25, y1 = attacker.y + 25;
    const x2 = x1 + Math.cos(attacker.angle) * 40;
    const y2 = y1 + Math.sin(attacker.angle) * 40;

    // Check if any player is hit by the attack
    for (let id in room.players) {
      if (id === socket.id) continue;
      const target = room.players[id];
      if (lineIntersectsRect(x1, y1, x2, y2, target.x, target.y, 50, 50)) {
        target.health = Math.max(0, target.health - 10); // Reduce health if hit
      }
    }
  });

  // Handle player disconnection
  socket.on("disconnect", () => {
    for (let code in rooms) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        socket.leave(code);
        if (socket.id === room.hostId || !Object.keys(room.players).length) {
          io.to(code).emit("kicked"); // Notify players that the game is over
          delete rooms[code]; // Remove the room
        }
        break;
      }
    }
  });
});

// Update loop to update player positions and game state
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
    io.to(code).emit("state", room.players); // Send updated state to clients
  }
}, 1000 / 60);

// Listen on a dynamic port for deployment or fallback to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
