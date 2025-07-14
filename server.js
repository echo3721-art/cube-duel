const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ✅ Serve static files from "public" directory
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

// ✅ ... [all your existing game logic unchanged] ...
// --- I didn't change anything inside your socket handlers or game logic ---

// ✅ Game loop to update player positions
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

// ✅ Dynamic PORT for Railway or other hosts
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
