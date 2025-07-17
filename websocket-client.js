class WebSocketClient {
    constructor(studyStimApp) {
        this.app = studyStimApp;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.messageQueue = [];
        this.isConnected = false;
        
        // Using Railway.app WebSocket server
        this.serverUrl = 'wss://studydupe.railway.app'; // Replace with your Railway URL
        
        // Connect immediately
        this.connect();
    }

    connect() {
        try {
            console.log('Attempting to connect to WebSocket server...');
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.onopen = () => {
                console.log('Connected to WebSocket server');
                this.reconnectAttempts = 0;
                this.isConnected = true;
                this.app.showStatus('Connected to server', 'success');
                
                // Send any queued messages
                while (this.messageQueue.length > 0) {
                    const data = this.messageQueue.shift();
                    this.send(data);
                }
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onclose = () => {
                console.log('WebSocket connection closed');
                this.isConnected = false;
                this.app.showStatus('Disconnected from server, attempting to reconnect...', 'error');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
                this.app.showStatus('Connection error, attempting to reconnect...', 'error');
                this.attemptReconnect();
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
            console.log('Sending message:', data);
            this.ws.send(JSON.stringify(data));
        } else {
            console.log('WebSocket not connected, queueing message:', data);
            this.messageQueue.push(data);
            this.app.showStatus('Connecting to server...', 'info');
            
            // Try to reconnect if not already connected
            if (!this.isConnected) {
                this.connect();
            }
        }
    }

    handleMessage(data) {
        console.log('Received WebSocket message:', data);
        switch (data.type) {
            case 'room_joined':
                console.log('Handling room_joined event:', data);
                this.app.handleRoomJoined(data);
                break;
            case 'user_joined':
                console.log('Handling user_joined event:', data);
                this.app.handleUserJoined(data);
                break;
            case 'user_left':
                console.log('Handling user_left event:', data);
                this.app.handleUserLeft(data);
                break;
            case 'chat_message':
                console.log('Handling chat_message event:', data);
                this.app.handleChatMessage(data);
                break;
            case 'timer_sync':
                console.log('Handling timer_sync event:', data);
                this.app.handleTimerSync(data);
                break;
            case 'webrtc_signal':
                console.log('Handling webrtc_signal event:', data);
                this.app.handleWebRTCSignal(data);
                break;
            case 'error':
                console.log('Handling error event:', data);
                this.app.showStatus(data.message, 'error');
                break;
            default:
                console.warn('Unknown message type:', data.type);
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
