const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

// 健康检查，防止容器被判死机
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const rooms = {};

// 你原来的游戏逻辑保持不变，这里省略...

// 例：更新玩家位置和状态
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
