class WebSocketClient {
    constructor(studyStimApp) {
        this.app = studyStimApp;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.messageQueue = [];
        this.isConnected = false;
        this.pendingRoom = null;
        this.pendingUsername = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isInitiator = false;
        
        // Using Railway.app WebSocket server with fallback to local for development
        this.serverUrl = window.location.hostname === 'localhost' 
            ? 'ws://localhost:8080'
            : 'wss://studydupe.railway.app';
        
        console.log('WebSocket URL:', this.serverUrl);
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

            this.ws.onclose = (event) => {
                console.log('WebSocket connection closed:', event.code, event.reason);
                this.isConnected = false;
                this.app.showStatus(`Disconnected from server (${event.code}), attempting to reconnect...`, 'error');
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
            try {
                this.ws.send(JSON.stringify(data));
            } catch (error) {
                console.error('Failed to send message:', error);
                this.messageQueue.push(data);
                this.app.showStatus('Failed to send message, will retry...', 'error');
            }
        } else {
            console.log('WebSocket not connected (state:', this.ws ? this.ws.readyState : 'null', '), queueing message:', data);
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
                console.log('Processing room_joined:', data);
                this.app.handleRoomJoined(data);
                break;
            case 'user_joined':
                console.log('Processing user_joined:', data);
                this.app.handleUserJoined(data);
                break;
            case 'user_left':
                console.log('Processing user_left:', data);
                this.app.handleUserLeft(data);
                break;
            case 'chat_message':
                console.log('Processing chat_message:', data);
                this.app.addChatMessage(data.username, data.message);
                break;
            case 'timer_sync':
                this.app.handleTimerSync(data);
                break;
            case 'webrtc_signal':
                this.handleWebRTCSignal(data);
                break;
            case 'error':
                this.app.showStatus(data.message, 'error');
                break;
        }
    }

    async joinRoom(roomId, username) {
        // Clean up any existing WebRTC connections
        this.cleanup();

        // Set up WebRTC first to ensure we have media access
        await this.setupWebRTC();

        // Join the room
        this.send({
            type: 'join_room',
            roomId: roomId,
            username: username
        });
        
        // The first person to join is the initiator
        this.isInitiator = !this.app.participants || this.app.participants.length === 0;
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

    async setupWebRTC() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Display local stream
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            // Create peer connection if we have a partner
            if (this.app.participants.length >= 2) {
                this.createPeerConnection();
            }
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.app.showStatus('Camera/microphone access denied', 'error');
        }
    }

    createPeerConnection() {
        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Add local stream tracks to the connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle incoming stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote stream');
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo && event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                    this.remoteStream = event.streams[0];
                }
            };

            // ICE candidate handling
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendWebRTCSignal(this.app.currentRoom, {
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            };

            // If we're the initiator, create and send the offer
            if (this.isInitiator) {
                this.createOffer();
            }
        } catch (error) {
            console.error('Error creating peer connection:', error);
            this.app.showStatus('Failed to set up video chat', 'error');
        }
    }

    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.sendWebRTCSignal(this.app.currentRoom, {
                type: 'offer',
                sdp: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleWebRTCSignal(data) {
        if (!this.peerConnection) {
            this.createPeerConnection();
        }

        try {
            if (data.signal.type === 'offer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.sendWebRTCSignal(this.app.currentRoom, {
                    type: 'answer',
                    sdp: answer
                });
            }
            else if (data.signal.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
            }
            else if (data.signal.type === 'ice-candidate') {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
            }
        } catch (error) {
            console.error('Error handling WebRTC signal:', error);
        }
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.remoteStream = null;
        this.isInitiator = false;
    }
}
