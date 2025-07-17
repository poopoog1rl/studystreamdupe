const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        handleUserDisconnect(ws);
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'join_room':
            handleJoinRoom(ws, data);
            break;
        case 'leave_room':
            handleLeaveRoom(ws, data);
            break;
        case 'chat_message':
        case 'timer_sync':
        case 'webrtc_signal':
            broadcastToRoom(data.roomId, data, ws);
            break;
    }
}

function handleJoinRoom(ws, data) {
    const { roomId, username } = data;
    
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }
    
    const room = rooms.get(roomId);
    room.add(ws);
    ws.roomId = roomId;
    ws.username = username;

    // Notify the user they've joined
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomId,
        username
    }));

    // Notify others in the room
    broadcastToRoom(roomId, {
        type: 'user_joined',
        username,
        roomId
    }, ws);
}

function handleLeaveRoom(ws, data) {
    const room = rooms.get(data.roomId);
    if (room) {
        room.delete(ws);
        if (room.size === 0) {
            rooms.delete(data.roomId);
        }
    }
}

function handleUserDisconnect(ws) {
    if (ws.roomId) {
        const room = rooms.get(ws.roomId);
        if (room) {
            room.delete(ws);
            if (room.size === 0) {
                rooms.delete(ws.roomId);
            } else {
                broadcastToRoom(ws.roomId, {
                    type: 'user_left',
                    username: ws.username,
                    roomId: ws.roomId
                });
            }
        }
    }
}

function broadcastToRoom(roomId, data, sender) {
    const room = rooms.get(roomId);
    if (room) {
        const message = JSON.stringify(data);
        room.forEach((client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
