const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Basic route for health check
app.get('/', (req, res) => {
    res.send('WebSocket server is running');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);
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
    console.log('Processing message:', data);
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
        default:
            console.log('Unknown message type:', data.type);
    }
}

function handleJoinRoom(ws, data) {
    const { roomId, username } = data;
    console.log(`User ${username} attempting to join room ${roomId}`);
    
    if (!rooms.has(roomId)) {
        console.log(`Creating new room ${roomId}`);
        rooms.set(roomId, new Set());
    }
    
    const room = rooms.get(roomId);
    room.add(ws);
    ws.roomId = roomId;
    ws.username = username;

    // Get current participants in the room
    const participants = Array.from(room).map(client => client.username).filter(name => name !== username);
    console.log(`Current participants in room ${roomId}:`, participants);

    // Notify the user they've joined
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomId,
        username,
        participants // Send current participants list
    }));

    // Notify others in the room
    broadcastToRoom(roomId, {
        type: 'user_joined',
        username,
        roomId
    }, ws);
}

function handleLeaveRoom(ws, data) {
    console.log(`User ${ws.username} leaving room ${data.roomId}`);
    const room = rooms.get(data.roomId);
    if (room) {
        room.delete(ws);
        if (room.size === 0) {
            console.log(`Room ${data.roomId} is empty, deleting`);
            rooms.delete(data.roomId);
        } else {
            broadcastToRoom(data.roomId, {
                type: 'user_left',
                username: ws.username,
                roomId: data.roomId
            }, ws);
        }
    }
}

function handleUserDisconnect(ws) {
    if (ws.roomId) {
        console.log(`User ${ws.username} disconnected from room ${ws.roomId}`);
        const room = rooms.get(ws.roomId);
        if (room) {
            room.delete(ws);
            if (room.size === 0) {
                console.log(`Room ${ws.roomId} is empty, deleting`);
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
        console.log(`Broadcasting to room ${roomId}:`, data);
        const message = JSON.stringify(data);
        let sentCount = 0;
        room.forEach((client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(message);
                sentCount++;
            }
        });
        console.log(`Message sent to ${sentCount} clients in room ${roomId}`);
    } else {
        console.log(`Room ${roomId} not found for broadcasting`);
    }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
