class WebSocketClient {
    constructor(studyStimApp) {
        this.app = studyStimApp;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Using Railway.app WebSocket server
        this.serverUrl = 'wss://your-project-name.railway.app'; // Replace with your Railway URL
    }

    connect() {
        try {
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.onopen = () => {
                console.log('Connected to WebSocket server');
                this.reconnectAttempts = 0;
                this.app.showStatus('Connected to server', 'success');
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onclose = () => {
                console.log('WebSocket connection closed');
                this.app.showStatus('Disconnected from server', 'error');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.app.showStatus('Connection error', 'error');
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket server:', error);
            this.app.showStatus('Failed to connect to server', 'error');
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Reconnection attempt ${this.reconnectAttempts}`);
                this.connect();
            }, 2000 * this.reconnectAttempts);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.error('WebSocket not connected');
            this.app.showStatus('Not connected to server', 'error');
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'room_joined':
                this.app.handleRoomJoined(data);
                break;
            case 'user_joined':
                this.app.handleUserJoined(data);
                break;
            case 'user_left':
                this.app.handleUserLeft(data);
                break;
            case 'chat_message':
                this.app.handleChatMessage(data);
                break;
            case 'timer_sync':
                this.app.handleTimerSync(data);
                break;
            case 'webrtc_signal':
                this.app.handleWebRTCSignal(data);
                break;
            case 'error':
                this.app.showStatus(data.message, 'error');
                break;
        }
    }

    joinRoom(roomId, username) {
        this.send({
            type: 'join_room',
            roomId: roomId,
            username: username
        });
    }

    leaveRoom(roomId) {
        this.send({
            type: 'leave_room',
            roomId: roomId
        });
    }

    sendChatMessage(roomId, message) {
        this.send({
            type: 'chat_message',
            roomId: roomId,
            message: message,
            username: this.app.username
        });
    }

    syncTimer(roomId, timerState) {
        this.send({
            type: 'timer_sync',
            roomId: roomId,
            timerState: timerState
        });
    }

    sendWebRTCSignal(roomId, signal) {
        this.send({
            type: 'webrtc_signal',
            roomId: roomId,
            signal: signal
        });
    }
}
