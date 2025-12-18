<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Cube Duel - Voice & Stun</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; font-family: sans-serif; background: #20e5fa; }
        #game-container { position: relative; width: 100vw; height: 100vh; }
        canvas { display: block; width: 100%; height: 100%; background: #5edcff; }
        #ui { position: absolute; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 8px; z-index: 10; }
        #status { padding: 5px; border-radius: 3px; margin-bottom: 10px; text-align: center; font-weight: bold; }
        .connected { background: #2ecc71; }
        .disconnected { background: #e74c3c; }
        .control-group { margin-bottom: 10px; display: flex; flex-direction: column; gap: 5px; }
        button { padding: 10px; border: none; border-radius: 4px; background: #2980b9; color: white; cursor: pointer; }
        #overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: none; flex-direction: column; align-items: center; justify-content: center; color: white; z-index: 100; }
        #remote-audio-container { display: none; }
    </style>
</head>
<body>
    <div id="game-container">
        <canvas id="gameCanvas"></canvas>
        <div id="ui">
            <div id="status" class="disconnected">Disconnected</div>
            <div class="control-group">
                <label>Cube Color</label>
                <input type="color" id="playerColor" value="#ff4757" />
            </div>
            <div id="setup-controls">
                <button id="hostBtn">Host Room</button>
                <input type="text" id="roomInput" placeholder="4-digit code" maxlength="4" style="margin-top:5px; text-align:center;"/>
                <button id="joinBtn">Join Room</button>
            </div>
            <div id="lobby-controls" style="display:none;">
                <p>Room: <strong id="roomCodeDisplay">----</strong></p>
                <button id="startBtn" style="display:none;">Start Battle</button>
            </div>
        </div>
        <div id="overlay">
            <h1 id="message">GAME OVER</h1>
            <button onclick="location.reload()">Back to Menu</button>
        </div>
    </div>

    <audio id="menuMusic" src="menu.mp3" loop></audio>
    <audio id="fightMusic" src="fight.mp3" loop></audio>
    <div id="remote-audio-container"></div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        let myId, roomCode, isHost, players = {}, localStream;
        const peers = {};

        const menuMusic = document.getElementById('menuMusic');
        const fightMusic = document.getElementById('fightMusic');

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        window.addEventListener('resize', resize); resize();

        async function setupVoice() {
            try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
            catch (e) { console.error("Mic access denied"); }
        }

        function createPeerConnection(targetId) {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peers[targetId] = pc;
            if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            pc.onicecandidate = (e) => { if(e.candidate) socket.emit('ice-candidate', { candidate: e.candidate, to: targetId }); };
            pc.ontrack = (e) => {
                let au = document.getElementById(`au-${targetId}`);
                if(!au){ au = document.createElement('audio'); au.id = `au-${targetId}`; au.autoplay = true; document.getElementById('remote-audio-container').appendChild(au); }
                au.srcObject = e.streams[0];
            };
            return pc;
        }

        document.getElementById('hostBtn').onclick = async () => { await setupVoice(); menuMusic.play(); socket.emit('host', { color: document.getElementById('playerColor').value }); };
        document.getElementById('joinBtn').onclick = async () => { 
            const code = document.getElementById('roomInput').value.trim();
            if(code.length === 4) { await setupVoice(); menuMusic.play(); socket.emit('join', { color: document.getElementById('playerColor').value, code }); }
        };
        document.getElementById('startBtn').onclick = () => socket.emit('start', { code: roomCode });

        socket.on('init', (data) => {
            myId = data.id; roomCode = data.code; isHost = data.isHost; players = data.players;
            document.getElementById('setup-controls').style.display = 'none';
            document.getElementById('lobby-controls').style.display = 'block';
            document.getElementById('roomCodeDisplay').innerText = roomCode;
            if(isHost) document.getElementById('startBtn').style.display = 'block';
            else socket.emit('readyForVoice', { code: roomCode });
        });

        socket.on('playerJoinedVoice', async (id) => {
            const pc = createPeerConnection(id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { offer, to: id });
        });

        socket.on('offer', async ({ offer, from }) => {
            const pc = createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { answer, to: from });
        });

        socket.on('answer', async ({ answer, from }) => { if(peers[from]) await peers[from].setRemoteDescription(new RTCSessionDescription(answer)); });
        socket.on('ice-candidate', async ({ candidate, from }) => { if(peers[from]) await peers[from].addIceCandidate(new RTCIceCandidate(candidate)); });

        socket.on('state', (s) => players = s);
        socket.on('startBattle', () => { menuMusic.pause(); menuMusic.currentTime = 0; fightMusic.play(); });
        socket.on('gameOver', (d) => {
            fightMusic.pause(); document.getElementById('overlay').style.display = 'flex';
            document.getElementById('message').innerText = d.winner === myId ? "VICTORY" : "DEFEAT";
            document.getElementById('message').style.color = d.winner === myId ? "#2ecc71" : "#e74c3c";
        });

        window.addEventListener('keydown', (e) => socket.emit('keydown', { key: e.key.toLowerCase(), code: roomCode }));
        window.addEventListener('keyup', (e) => socket.emit('keyup', { key: e.key.toLowerCase(), code: roomCode }));
        canvas.addEventListener('mousemove', (e) => {
            if (players[myId]) {
                const angle = Math.atan2(e.clientY - (canvas.height/2), e.clientX - (canvas.width/2));
                socket.emit('aim', { code: roomCode, angle });
            }
        });
        canvas.addEventListener('mousedown', () => socket.emit('attack', { code: roomCode }));

        function draw() {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            for(let id in players) {
                const p = players[id];
                ctx.save();
                ctx.translate(p.x + 25, p.y + 25);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.fillRect(-25,-25,50,50);
                ctx.fillStyle = "white"; ctx.fillRect(10,-15,10,10); ctx.fillRect(10,5,10,10);
                ctx.restore();
                ctx.fillStyle = "#333"; ctx.fillRect(p.x, p.y-15, 50, 6);
                ctx.fillStyle = p.health > 30 ? "#2ecc71" : "#e74c3c";
                ctx.fillRect(p.x, p.y-15, (p.health/100)*50, 6);
                if(id === myId) { ctx.strokeStyle = "white"; ctx.strokeRect(p.x-5,p.y-5,60,60); }
            }
            requestAnimationFrame(draw);
        }
        draw();
        socket.on('connect', () => { document.getElementById('status').innerText = "Connected"; document.getElementById('status').className = "connected"; });
    </script>
</body>
</html>