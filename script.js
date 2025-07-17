class StudyStim {
    constructor() {
        this.currentRoom = null;
        this.username = null;
        this.participants = [];
        this.timer = {
            minutes: 25,
            seconds: 0,
            isRunning: false,
            interval: null
        };
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        
        this.init();
    }

    init() {
        this.wsClient = new WebSocketClient(this);
        this.wsClient.connect();
        this.setupEventListeners();
        this.setupWebRTC();
    }

    setupEventListeners() {
        // Room setup events
        document.getElementById('create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room').addEventListener('click', () => this.joinRoom());
        document.getElementById('leave-room').addEventListener('click', () => this.leaveRoom());

        // Timer events
        document.getElementById('start-timer').addEventListener('click', () => this.startTimer());
        document.getElementById('pause-timer').addEventListener('click', () => this.pauseTimer());
        document.getElementById('reset-timer').addEventListener('click', () => this.resetTimer());

        // Timer presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const minutes = parseInt(e.target.dataset.minutes);
                this.setTimer(minutes, 0);
            });
        });

        // Chat events
        document.getElementById('send-message').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    async setupWebRTC() {
        try {
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            document.getElementById('local-video').srcObject = this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showStatus('Camera/microphone access denied. Video features will be limited.', 'error');
        }
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    createRoom() {
        const username = document.getElementById('username').value.trim();
        if (!username) {
            this.showStatus('Please enter your name', 'error');
            return;
        }

        const roomId = this.generateRoomId();
        this.joinRoomWithId(roomId, username);
    }

    joinRoom() {
        const roomId = document.getElementById('room-id').value.trim();
        const username = document.getElementById('username').value.trim();
        
        if (!username) {
            this.showStatus('Please enter your name', 'error');
            return;
        }

        if (!roomId) {
            this.showStatus('Please enter a room ID', 'error');
            return;
        }

        this.joinRoomWithId(roomId, username);
    }

    joinRoomWithId(roomId, username) {
        this.currentRoom = roomId;
        this.username = username;
        
        // Store room data in localStorage for persistence
        localStorage.setItem('studystim_room', roomId);
        localStorage.setItem('studystim_username', username);

        // Update UI
        document.getElementById('room-setup').classList.add('hidden');
        document.getElementById('study-room').classList.remove('hidden');
        document.getElementById('current-room-id').textContent = roomId;
        
        this.showStatus(`Joined room ${roomId}`, 'success');
        this.addChatMessage('System', `${username} joined the room`, true);
        
        // Simulate adding participant (in real implementation, this would be handled by WebRTC signaling)
        this.updateParticipantCount(1);
    }

    leaveRoom() {
        if (this.timer.interval) {
            clearInterval(this.timer.interval);
        }

        // Clean up WebRTC connections
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Clear localStorage
        localStorage.removeItem('studystim_room');
        localStorage.removeItem('studystim_username');

        // Reset UI
        document.getElementById('study-room').classList.add('hidden');
        document.getElementById('room-setup').classList.remove('hidden');
        document.getElementById('room-id').value = '';
        document.getElementById('username').value = '';
        document.getElementById('chat-messages').innerHTML = '';
        
        this.resetTimer();
        this.currentRoom = null;
        this.username = null;
        
        this.showStatus('Left the room', 'info');
    }

    updateParticipantCount(count) {
        document.getElementById('participant-count').textContent = `${count}/2 participants`;
        
        if (count === 2) {
            document.getElementById('remote-label').textContent = 'Study Partner';
            this.showStatus('Study partner connected!', 'success');
        } else {
            document.getElementById('remote-label').textContent = 'Waiting for partner...';
        }
    }

    // Timer functionality
    setTimer(minutes, seconds) {
        this.timer.minutes = minutes;
        this.timer.seconds = seconds;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const minutes = String(this.timer.minutes).padStart(2, '0');
        const seconds = String(this.timer.seconds).padStart(2, '0');
        document.getElementById('timer-text').textContent = `${minutes}:${seconds}`;
    }

    startTimer() {
        if (this.timer.isRunning) return;

        this.timer.isRunning = true;
        document.querySelector('.timer-circle').classList.add('active');
        
        this.timer.interval = setInterval(() => {
            if (this.timer.seconds > 0) {
                this.timer.seconds--;
            } else if (this.timer.minutes > 0) {
                this.timer.minutes--;
                this.timer.seconds = 59;
            } else {
                // Timer finished
                this.pauseTimer();
                this.showStatus('Study session completed!', 'success');
                this.playNotificationSound();
                return;
            }
            
            this.updateTimerDisplay();
        }, 1000);

        this.addChatMessage('System', `${this.username} started the timer`, true);
    }

    pauseTimer() {
        this.timer.isRunning = false;
        document.querySelector('.timer-circle').classList.remove('active');
        
        if (this.timer.interval) {
            clearInterval(this.timer.interval);
            this.timer.interval = null;
        }
    }

    resetTimer() {
        this.pauseTimer();
        this.setTimer(25, 0);
    }

    playNotificationSound() {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 1);
    }

    // Chat functionality
    sendMessage() {
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (!message) return;

        this.addChatMessage(this.username, message, false);
        messageInput.value = '';
        
        // In a real implementation, this would send the message to the other participant
        // For demo purposes, we'll simulate an echo after a delay
        setTimeout(() => {
            this.simulatePartnerMessage(message);
        }, 1000 + Math.random() * 2000);
    }

    simulatePartnerMessage(originalMessage) {
        const responses = [
            "That's interesting!",
            "I agree!",
            "Good point",
            "Let me think about that",
            "Thanks for sharing",
            "I'm focusing on my studies too",
            "Great idea!",
            "Let's keep studying!"
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.addChatMessage('Study Partner', randomResponse, false);
    }

    addChatMessage(sender, message, isSystem = false) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender === this.username ? 'own' : 'other'}`;
        
        if (isSystem) {
            messageDiv.className = 'message system';
            messageDiv.style.background = '#f0f0f0';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.fontStyle = 'italic';
            messageDiv.style.color = '#666';
        }

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            ${!isSystem ? `<div class="message-sender">${sender}</div>` : ''}
            <div class="message-content">${message}</div>
            <div class="message-time">${time}</div>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.classList.remove('hidden');

        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 3000);
    }

    // Load saved room data on page load
    loadSavedRoom() {
        const savedRoom = localStorage.getItem('studystim_room');
        const savedUsername = localStorage.getItem('studystim_username');
        
        if (savedRoom && savedUsername) {
            document.getElementById('room-id').value = savedRoom;
            document.getElementById('username').value = savedUsername;
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const app = new StudyStim();
    app.loadSavedRoom();
    
    // Add some demo messages to show chat functionality
    setTimeout(() => {
        if (app.currentRoom) {
            app.addChatMessage('System', 'Welcome to StudyStim! Start studying together.', true);
        }
    }, 1000);
});

// Handle page visibility changes to pause timer when tab is not active
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, you might want to pause the timer or show a notification
        console.log('Page hidden - consider pausing timer');
    } else {
        // Page is visible again
        console.log('Page visible - timer continues');
    }
});
