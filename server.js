const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
    socket.on('host', (data) => {
        const code = generateRoomCode();
        rooms[code] = { players: {}, started: false };
        rooms[code].players[socket.id] = {
            id: socket.id, x: 100, y: 300,
            color: data.color || "#ff4757",
            angle: 0, health: 100, keys: {},
            stunnedUntil: 0 // New: Stun tracker
        };
        socket.join(code);
        socket.emit('init', { id: socket.id, code, isHost: true, players: rooms[code].players });
    });

    socket.on('join', (data) => {
        const room = rooms[data.code];
        if (room && Object.keys(room.players).length < 2) {
            room.players[socket.id] = {
                id: socket.id, x: 600, y: 300,
                color: data.color || "#2ecc71",
                angle: 0, health: 100, keys: {},
                stunnedUntil: 0
            };
            socket.join(data.code);
            socket.emit('init', { id: socket.id, code: data.code, isHost: false, players: room.players });
            io.to(data.code).emit('state', room.players);
        }
    });

    socket.on('start', (data) => {
        const room = rooms[data.code];
        if (room) {
            for (let id in room.players) { room.players[id].health = 100; }
            room.started = true;
            io.to(data.code).emit('startBattle');
        }
    });

    // --- Voice Signaling ---
    socket.on('readyForVoice', (data) => socket.to(data.code).emit('playerJoinedVoice', socket.id));
    socket.on('offer', (data) => socket.to(data.to).emit('offer', { offer: data.offer, from: socket.id }));
    socket.on('answer', (data) => socket.to(data.to).emit('answer', { answer: data.answer, from: socket.id }));
    socket.on('ice-candidate', (data) => socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id }));

    // --- Inputs ---
    socket.on('keydown', (data) => { if (rooms[data.code]?.players[socket.id]) rooms[data.code].players[socket.id].keys[data.key] = true; });
    socket.on('keyup', (data) => { if (rooms[data.code]?.players[socket.id]) rooms[data.code].players[socket.id].keys[data.key] = false; });
    socket.on('aim', (data) => { if (rooms[data.code]?.players[socket.id]) rooms[data.code].players[socket.id].angle = data.angle; });

    // --- Combat Logic (Center-based) ---
    socket.on('attack', (data) => {
        const room = rooms[data.code];
        if (room && room.started && room.players[socket.id]) {
            const attacker = room.players[socket.id];
            if (Date.now() < attacker.stunnedUntil) return; // Can't attack while stunned

            for (let id in room.players) {
                if (id !== socket.id) {
                    const victim = room.players[id];
                    const dx = (victim.x + 25) - (attacker.x + 25);
                    const dy = (victim.y + 25) - (attacker.y + 25);
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Tight Hitbox (45 units)
                    if (dist < 45) { 
                        victim.health -= 10;
                        
                        // MASSIVE Knockback
                        const angle = Math.atan2(dy, dx);
                        const force = 100; 
                        victim.x += Math.cos(angle) * force;
                        victim.y += Math.sin(angle) * force;
                        
                        // Stun victim so they can't immediately run back
                        victim.stunnedUntil = Date.now() + 200; 

                        if (victim.health <= 0) {
                            io.to(data.code).emit('gameOver', { winner: socket.id });
                            room.started = false; 
                        }
                    }
                }
            }
            io.to(data.code).emit('state', room.players);
        }
    });

    socket.on('disconnect', () => {
        for (const code in rooms) {
            if (rooms[code].players[socket.id]) {
                delete rooms[code].players[socket.id];
                io.to(code).emit('state', rooms[code].players);
            }
        }
    });
});

// Game Loop
setInterval(() => {
    for (let code in rooms) {
        const room = rooms[code];
        if (!room.started) continue;
        for (let id in room.players) {
            const p = room.players[id];
            
            // Skip movement if stunned
            if (Date.now() < p.stunnedUntil) continue;

            if (p.keys['w'] || p.keys['arrowup']) p.y -= 5;
            if (p.keys['s'] || p.keys['arrowdown']) p.y += 5;
            if (p.keys['a'] || p.keys['arrowleft']) p.x -= 5;
            if (p.keys['d'] || p.keys['arrowright']) p.x += 5;
        }
        io.to(code).emit('state', room.players);
    }
}, 1000 / 60);

server.listen(3000, () => console.log('Server active on :3000'));
