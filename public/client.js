const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const colorPicker = document.getElementById("playerColor");
const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const kickBtn = document.getElementById("kickBtn");
const exitBtn = document.getElementById("exitBtn");
const restartBtn = document.getElementById("restartBtn");
const roomInput = document.getElementById("roomInput");
const roomCodeEl = document.getElementById("roomCode");
const roomDisplay = document.getElementById("roomDisplay");
const overlay = document.getElementById("overlay");
const messageBox = document.getElementById("message");

const menuMusic = document.getElementById("menuMusic");
const fightSound = document.getElementById("fightSound");

let playerId = null,
    roomCode = null,
    isHost = false,
    players = {},
    gameStarted = false,
    gameEnded = false;

let mouseX = 0,
    mouseY = 0;

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener("resize", resize);
resize();

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
});

hostBtn.onclick = () => socket.emit("host", { color: colorPicker.value });

joinBtn.onclick = () => {
  const code = roomInput.value.trim();
  if (code.length !== 4) return alert("Enter 4-digit code");
  socket.emit("join", { color: colorPicker.value, code });
};

startBtn.onclick = () => {
  menuMusic.pause();
  fightSound.currentTime = 0;
  fightSound.play();
  socket.emit("start", { code: roomCode });
};

kickBtn.onclick = () => socket.emit("kick", { code: roomCode });

exitBtn.onclick = () => {
  socket.emit("exitGame", { code: roomCode });
  location.reload();
};

restartBtn.onclick = () => {
  overlay.style.visibility = "hidden";
  fightSound.pause();
  fightSound.currentTime = 0;
  socket.emit("start", { code: roomCode });
};

window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    socket.emit("attack", { code: roomCode });
    e.preventDefault();
  }
  socket.emit("keydown", { key: e.key, code: roomCode });
});
window.addEventListener("keyup", (e) => {
  socket.emit("keyup", { key: e.key, code: roomCode });
});
window.addEventListener("blur", () =>
  socket.emit("keyup", { key: null, code: roomCode })
);

socket.on("connect", () => {
  statusEl.textContent = "Connected";
  statusEl.classList.replace("disconnected", "connected");
});

socket.on("disconnect", () => {
  statusEl.textContent = "Disconnected";
  statusEl.classList.replace("connected", "disconnected");
});

socket.on("init", (data) => {
  playerId = data.id;
  isHost = data.isHost;
  roomCode = data.code;
  roomCodeEl.textContent = roomCode;
  roomDisplay.style.display = "inline";
  hostBtn.disabled = joinBtn.disabled = roomInput.disabled = true;

  if (isHost) {
    startBtn.style.display = "inline";
    kickBtn.style.display = "inline";
    exitBtn.style.display = "inline";
    restartBtn.style.display = "inline";
  }
});

socket.on("invalidCode", () => alert("Room not found."));
socket.on("full", () => alert("Room is full."));
socket.on("kicked", () => {
  alert("Kicked by host");
  location.reload();
});
socket.on("playerJoined", () => alert("Player joined!"));

socket.on("startGame", () => {
  gameStarted = true;
  gameEnded = false;
  overlay.style.visibility = "hidden";
  fightSound.play();
  menuMusic.pause();
});

socket.on("state", (s) => {
  players = s;
});

socket.on("gameOver", ({ winner }) => {
  gameEnded = true;
  fightSound.pause();
  messageBox.textContent = winner === playerId ? "You Win!" : "Game Over";
  overlay.style.visibility = "visible";
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ids = Object.keys(players);
  const me = players[playerId];
  const otherId = ids.find((id) => id !== playerId);
  const opponent = players[otherId];

  ids.forEach((id) => {
    const p = players[id];
    if (!p) return;

    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 50, 50);
  });

  ids.forEach((id) => {
    const p = players[id];
    const cx = p.x + 25;
    const cy = p.y + 25;
    let angle = p.angle;

    if (id === playerId) {
      angle = Math.atan2(mouseY - cy, mouseX - cx);
      socket.emit("angle", { code: roomCode, angle });
    }

    const x2 = cx + Math.cos(angle) * 100;
    const y2 = cy + Math.sin(angle) * 100;

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  ids.forEach((id) => {
    const p = players[id];
    ctx.fillStyle = "red";
    ctx.fillRect(p.x, p.y - 12, 50, 6);
    ctx.fillStyle = "lime";
    ctx.fillRect(p.x, p.y - 12, (p.health / 100) * 50, 6);
  });

  requestAnimationFrame(draw);
}

draw();
