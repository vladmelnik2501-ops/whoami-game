class WhoAmIGame {
    constructor() {
        // Состояние игры
        this.state = {
            screen: 'login',
            playerId: null,
            playerName: '',
            roomCode: '',
            isHost: false,
            players: [],
            words: {},
            currentWriter: 0,
            gameStarted: false,
            allWordsSubmitted: false
        };
        
        // Определение браузера
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isWebKit = this.isSafari || this.isIOS;
        this.isChromeIOS = /CriOS/.test(navigator.userAgent);
        
        console.log('Browser detection:', {
            isIOS: this.isIOS,
            isSafari: this.isSafari,
            isWebKit: this.isWebKit,
            isChromeIOS: this.isChromeIOS,
            userAgent: navigator.userAgent
        });
        
        // PeerJS соединения
        this.peer = null;
        this.connections = {};
        this.hostConnection = null;
        
        // Флаги
        this.playerAdded = false;
        this.connectionAttempts = 0;
        
        // История сообщений
        this.messageHistory = [];
        this.MAX_HISTORY = 100;
        
        // Инициализация
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.generatePlayerId();
        this.showScreen('login');
        this.initSound();
        
        // Восстанавливаем имя из localStorage
        const savedName = localStorage.getItem('whoami_playername');
        if (savedName) {
            document.getElementById('playerName').value = savedName;
        }
        
        // Для Safari: предварительная инициализация WebRTC
        if (this.isWebKit) {
            this.initializeWebRTCForSafari();
        }
    }
    
    initSound() {
        try {
            this.messageSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3');
            this.messageSound.preload = 'auto';
        } catch (error) {
            console.log('Звук недоступен:', error);
        }
    }
    
    initializeWebRTCForSafari() {
        console.log('Initializing WebRTC for Safari/WebKit');
        
        // Полифиллы для Safari
        if (typeof RTCPeerConnection === 'undefined') {
            window.RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        }
        
        if (typeof RTCSessionDescription === 'undefined') {
            window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
        }
        
        if (typeof RTCIceCandidate === 'undefined') {
            window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
        }
        
        // Запрашиваем разрешения заранее (требуется для iOS 14.3+)
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            // Запрашиваем фиктивные разрешения для активации WebRTC
            navigator.mediaDevices.getUserMedia({ audio: false, video: false })
                .then((stream) => {
                    console.log('Safari WebRTC permissions granted');
                    stream.getTracks().forEach(track => track.stop());
                })
                .catch(err => console.log('Safari permissions (non-critical):', err.message));
        }
    }
    
    generatePlayerId() {
        this.state.playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    generateMessageId() {
        return `${this.state.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    setupEventListeners() {
        // Вход
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        
        // Лобби
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('backToGameBtn').addEventListener('click', () => this.backToGame());
        document.getElementById('leaveLobbyBtn').addEventListener('click', () => this.leaveLobby());
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendChatMessage('lobby'));
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage('lobby');
        });
        
        // Ввод слов
        document.getElementById('submitWordBtn').addEventListener('click', () => this.submitWord());
        document.getElementById('wordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitWord();
        });
        
        // Игра
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('backToLobbyBtn').addEventListener('click', () => this.backToLobby());
        document.getElementById('sendGameMessageBtn').addEventListener('click', () => this.sendChatMessage('game'));
        document.getElementById('gameChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage('game');
        });
        
        // Модальное окно
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.hideModal());
        
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal')) {
                this.hideModal();
            }
        });
        
        // Обработка закрытия вкладки
        window.addEventListener('beforeunload', (e) => {
            if (this.state.gameStarted || this.state.roomCode) {
                this.cleanup();
            }
        });
    }
    
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName + 'Screen').classList.add('active');
        this.state.screen = screenName;
    }
    
    showModal(title, message) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('modal').style.display = 'flex';
    }
    
    hideModal() {
        document.getElementById('modal').style.display = 'none';
    }
    
    showNotification(message, duration = 3000) {
        const notification = document.getElementById('notification');
        document.getElementById('notificationText').textContent = message;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    }
    
    addChatMessage(text, sender = 'Система', type = 'system', chatType = 'lobby') {
        let chatElement;
        if (chatType === 'game') {
            chatElement = document.getElementById('gameChatMessages');
        } else {
            chatElement = document.getElementById('chatMessages');
        }
        
        if (!chatElement) return;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.innerHTML = `
            <span class="time">${time}</span>
            ${type === 'chat' ? `<strong>${sender}:</strong> ` : ''}
            ${text}
        `;
        
        chatElement.appendChild(message);
        chatElement.scrollTop = chatElement.scrollHeight;
        
        // Проигрываем звук для входящих сообщений от других игроков
        if (type === 'chat' && this.messageSound && sender !== this.state.playerName) {
            try {
                this.messageSound.currentTime = 0;
                this.messageSound.play().catch(e => console.log('Не удалось воспроизвести звук'));
            } catch (error) {
                console.log('Ошибка воспроизведения звука:', error);
            }
        }
    }
    
    // Получение настроек PeerJS для разных браузеров
    getPeerConfig() {
        // Базовые ICE серверы
        let iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ];
        
        // Для Safari добавляем TURN серверы (обязательно!)
        if (this.isWebKit) {
            console.log('Adding TURN servers for Safari/WebKit');
            iceServers = iceServers.concat([
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                // Резервные TURN серверы
                {
                    urls: 'turn:numb.viagenie.ca',
                    username: 'webrtc@live.com',
                    credential: 'muazkh'
                },
                {
                    urls: 'turn:turn.bistri.com:80',
                    username: 'homeo',
                    credential: 'homeo'
                }
            ]);
        }
        
        const config = {
            iceServers: iceServers,
            iceCandidatePoolSize: 5,
            iceTransportPolicy: 'all'
        };
        
        // Специфичные настройки для Safari
        if (this.isWebKit) {
            config.sdpSemantics = 'unified-plan';
            config.bundlePolicy = 'max-bundle';
            config.rtcpMuxPolicy = 'require';
        }
        
        return config;
    }
    
    getPeerOptions(isHost = false) {
        const options = {
            debug: 2,
            config: this.getPeerConfig(),
            // Важно для Safari!
            constraints: {
                optional: [
                    { DtlsSrtpKeyAgreement: true },
                    { RtpDataChannels: true }
                ]
            }
        };
        
        // Для iOS/Safari используем облачный сервер с HTTPS
        if (this.isIOS || this.isSafari) {
            console.log('Using cloud PeerJS server for iOS/Safari');
            Object.assign(options, {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                // Проброс ICE кандидатов через сервер (важно для NAT)
                proxied: true
            });
        }
        
        return options;
    }
    
    sendChatMessage(chatType = 'lobby') {
        let input, message;
        
        if (chatType === 'game') {
            input = document.getElementById('gameChatInput');
            message = input.value.trim();
        } else {
            input = document.getElementById('chatInput');
            message = input.value.trim();
        }
        
        if (!message) return;
        
        const messageId = this.generateMessageId();
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Добавляем сообщение сразу в свой чат
        this.addChatMessage(message, this.state.playerName, 'chat', chatType);
        
        // Сохраняем в историю
        this.messageHistory.push({
            message: message,
            sender: this.state.playerName,
            senderId: this.state.playerId,
            timestamp: timestamp,
            chatType: chatType
        });
        
        if (this.messageHistory.length > this.MAX_HISTORY) {
            this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
        }
        
        // Подготовка данных для отправки
        const chatData = {
            type: 'CHAT_MESSAGE',
            message: message,
            playerName: this.state.playerName,
            playerId: this.state.playerId,
            chatType: chatType,
            timestamp: timestamp
        };
        
        if (this.state.isHost) {
            // Если хост, рассылаем всем клиентам
            this.broadcastToPlayers(chatData);
        } else {
            // Если клиент, отправляем хосту
            if (this.hostConnection && this.hostConnection.open) {
                this.hostConnection.send(chatData);
            } else {
                this.showNotification('Нет соединения с хостом');
            }
        }
        
        input.value = '';
        input.focus();
    }
    
    async createRoom() {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            this.showNotification('Введите ваше имя');
            return;
        }
        
        this.state.playerName = playerName;
        localStorage.setItem('whoami_playername', playerName);
        this.state.isHost = true;
        this.state.roomCode = this.generateRoomCode();
        this.playerAdded = false;
        this.connectionAttempts = 0;
        this.messageHistory = [];
        this.connections = {};
        
        console.log('Creating room for:', this.isWebKit ? 'Safari/WebKit' : 'Other browser');
        
        try {
            // Для Safari: дополнительная задержка перед созданием Peer
            if (this.isWebKit) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const options = this.getPeerOptions(true);
            this.peer = new Peer(this.state.roomCode, options);
            
            this.setupPeerEvents();
            
            this.state.players = [{
                id: this.state.playerId,
                name: playerName,
                isHost: true,
                connectionId: this.state.roomCode
            }];
            
            this.showScreen('lobby');
            this.updateLobbyUI();
            
            // Очищаем чат и добавляем приветственное сообщение
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
                this.addChatMessage(`Вы создали комнату "${this.state.roomCode}"`);
                this.addChatMessage('Отправьте код друзьям, чтобы они могли присоединиться');
                
                // Особое сообщение для Safari
                if (this.isWebKit) {
                    this.addChatMessage('🔧 Используется режим совместимости для Safari');
                    this.addChatMessage('Подключение может занять 10-15 секунд...');
                }
            }
            
            this.showNotification(`Комната создана! Код: ${this.state.roomCode}`);
            
        } catch (error) {
            console.error('Create room error:', error);
            this.handleSafariError(error);
        }
    }
    
    async joinRoom() {
        const playerName = document.getElementById('playerName').value.trim();
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        
        if (!playerName) {
            this.showNotification('Введите ваше имя');
            return;
        }
        
        if (!roomCode || roomCode.length !== 6) {
            this.showNotification('Введите корректный код комнаты');
            return;
        }
        
        this.state.playerName = playerName;
        localStorage.setItem('whoami_playername', playerName);
        this.state.roomCode = roomCode;
        this.state.isHost = false;
        this.playerAdded = false;
        this.connectionAttempts = 0;
        this.messageHistory = [];
        this.connections = {};
        
        console.log('Joining room from:', this.isWebKit ? 'Safari/WebKit' : 'Other browser');
        
        try {
            // Для Safari: задержка и уникальный ID
            if (this.isWebKit) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const options = this.getPeerOptions(false);
            
            this.peer = new Peer(clientId, options);
            this.setupPeerEvents();
            
            this.showScreen('lobby');
            
            // Очищаем чат
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
                this.addChatMessage(`Подключаемся к комнате "${roomCode}"...`);
                
                if (this.isWebKit) {
                    this.addChatMessage('🔧 Подключение через Safari...');
                    this.addChatMessage('Это может занять до 15 секунд');
                }
            }
            
        } catch (error) {
            console.error('Join room error:', error);
            this.handleSafariError(error);
        }
    }
    
    handleSafariError(error) {
        let message = 'Ошибка подключения';
        
        if (this.isWebKit) {
            if (error.type === 'peer-unavailable') {
                message = 'Safari: не удалось подключиться к комнате\nПопробуйте:\n1. Обновить страницу\n2. Проверить код комнаты';
            } else if (error.type === 'network') {
                message = 'Safari: проблемы с сетью\nРазрешите WebRTC в настройках Safari';
            } else if (error.message && error.message.includes('SSL')) {
                message = 'Safari: ошибка безопасности\nПопробуйте другой браузер на iOS';
            } else if (error.type) {
                message = `Safari: ${error.type}\nПопробуйте Chrome для iOS или Telegram`;
            } else {
                message = 'Safari: неизвестная ошибка\nПопробуйте обновить страницу';
            }
        }
        
        this.showNotification(message, 5000);
        
        // Предложение использовать альтернативный браузер
        if (this.isIOS) {
            setTimeout(() => {
                if (confirm('На iPhone лучше использовать:\n\n• Chrome для iOS\n• Браузер Telegram\n• Firefox для iOS\n\nОткрыть в Chrome?')) {
                    window.open(window.location.href, '_blank');
                }
            }, 2000);
        }
    }
    
    setupPeerEvents() {
        this.peer.on('open', (id) => {
            console.log('✅ Peer connected:', id);
            
            if (this.state.isHost) {
                this.showNotification('Комната готова к подключениям');
            } else {
                // Для Safari: дополнительная задержка перед подключением к хосту
                if (this.isWebKit) {
                    setTimeout(() => this.connectToHost(), 1000);
                } else {
                    this.connectToHost();
                }
            }
        });
        
        this.peer.on('connection', (conn) => {
            console.log('🔗 New connection:', conn.peer);
            this.setupConnection(conn);
        });
        
        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            this.handleSafariError(err);
        });
        
        this.peer.on('disconnected', () => {
            console.log('Peer disconnected');
            if (!this.state.isHost) {
                this.showNotification('Соединение потеряно. Пытаемся переподключиться...');
                setTimeout(() => {
                    if (this.peer && !this.peer.disconnected) {
                        this.peer.reconnect();
                    }
                }, 2000);
            }
        });
    }
    
    connectToHost() {
        if (this.connectionAttempts >= 5) {
            this.showNotification('Не удалось подключиться');
            return;
        }
        
        this.connectionAttempts++;
        
        // Для Safari: увеличиваем таймаут
        const timeout = this.isWebKit ? 20000 : 10000;
        
        console.log(`Connection attempt ${this.connectionAttempts} (timeout: ${timeout}ms)`);
        
        const conn = this.peer.connect(this.state.roomCode, {
            reliable: true,
            serialization: 'json',
            metadata: {
                playerId: this.state.playerId,
                playerName: this.state.playerName,
                isWebKit: this.isWebKit
            }
        });
        
        const timeoutId = setTimeout(() => {
            if (!this.hostConnection) {
                console.log('Connection timeout');
                this.connectToHost();
            }
        }, timeout);
        
        conn.on('open', () => {
            clearTimeout(timeoutId);
            console.log('✅ Connected to host');
            this.setupConnection(conn);
            this.hostConnection = conn;
            
            if (!this.playerAdded) {
                conn.send({
                    type: 'JOIN_REQUEST',
                    playerId: this.state.playerId,
                    playerName: this.state.playerName
                });
                this.playerAdded = true;
            }
            
            this.showNotification('Успешно подключено!');
        });
        
        conn.on('error', (err) => {
            clearTimeout(timeoutId);
            console.error('Connection error:', err);
            
            if (this.connectionAttempts < 5) {
                const delay = this.isWebKit ? 3000 : 2000;
                setTimeout(() => this.connectToHost(), delay);
            }
        });
    }
    
    setupConnection(conn) {
        const peerId = conn.peer;
        
        this.connections[peerId] = conn;
        
        conn.on('data', (data) => {
            console.log('Получены данные от', peerId, ':', data);
            this.handleIncomingData(data, peerId);
        });
        
        conn.on('close', () => {
            console.log('Соединение закрыто:', peerId);
            delete this.connections[peerId];
            
            // Удаляем игрока из списка
            this.removePlayerByConnectionId(peerId);
            
            if (Object.keys(this.connections).length === 0 && !this.state.isHost) {
                this.showNotification('Соединение с комнатой потеряно');
            }
        });
        
        conn.on('error', (err) => {
            console.error('Ошибка соединения:', err);
        });
        
        // Если это хост и подключился новый клиент
        if (this.state.isHost && conn.peer !== this.state.roomCode) {
            console.log('Новый клиент подключился:', conn.metadata);
            
            // Отправляем подтверждение подключения с задержкой для стабильности
            setTimeout(() => {
                if (conn.open) {
                    conn.send({
                        type: 'CONNECTION_ESTABLISHED',
                        playerId: conn.metadata?.playerId || conn.peer,
                        players: this.state.players
                    });
                }
            }, 500);
        }
    }
    
    handleIncomingData(data, fromPeer) {
        switch (data.type) {
            case 'CONNECTION_ESTABLISHED':
                this.state.players = data.players || [];
                this.updateLobbyUI();
                this.addChatMessage(`Вы подключились как ${this.state.playerName}`);
                this.showNotification('Успешно подключено к комнате!');
                break;
                
            case 'JOIN_REQUEST':
                if (this.state.isHost) {
                    const existingPlayer = this.state.players.find(p => p.id === data.playerId);
                    
                    if (!existingPlayer) {
                        this.addPlayer({
                            id: data.playerId,
                            name: data.playerName,
                            connectionId: fromPeer,
                            isHost: false
                        });
                    }
                }
                break;
                
            case 'PLAYERS_UPDATE':
                this.state.players = data.players;
                this.updateLobbyUI();
                break;
                
            case 'CHAT_MESSAGE':
                // Пропускаем свои собственные сообщения
                if (data.playerId === this.state.playerId) return;
                
                // Добавляем сообщение в чат
                this.addChatMessage(data.message, data.playerName, 'chat', data.chatType);
                
                // Если это хост, рассылаем всем остальным клиентам
                if (this.state.isHost) {
                    this.broadcastToPlayers(data, fromPeer);
                }
                break;
                
            case 'START_GAME':
                this.state.gameStarted = true;
                this.state.currentWriter = 0;
                this.state.words = {};
                this.state.allWordsSubmitted = false;
                this.showWordScreen();
                break;
                
            case 'WORD_SUBMITTED':
                this.handleWordSubmitted(data);
                break;
                
            case 'GAME_STATE_UPDATE':
                if (data.currentWriter !== undefined) {
                    this.state.currentWriter = data.currentWriter;
                }
                if (data.words) {
                    this.state.words = data.words;
                }
                this.updateWordScreen();
                break;
                
            case 'ALL_WORDS_READY':
                this.state.allWordsSubmitted = true;
                this.showGameScreen();
                break;
        }
    }
    
    handleWordSubmitted(data) {
        this.state.words[data.targetPlayerId] = {
            word: data.word,
            author: data.authorName
        };
        
        if (this.state.isHost) {
            const authorIndex = this.state.players.findIndex(p => p.id === data.authorId);
            if (authorIndex !== -1) {
                this.state.currentWriter = (authorIndex + 1) % this.state.players.length;
            }
            
            if (Object.keys(this.state.words).length >= this.state.players.length) {
                this.state.allWordsSubmitted = true;
                setTimeout(() => {
                    this.broadcastToPlayers({ type: 'ALL_WORDS_READY' });
                    this.showGameScreen();
                }, 1000);
            }
            
            this.broadcastToPlayers({
                type: 'GAME_STATE_UPDATE',
                currentWriter: this.state.currentWriter,
                words: this.state.words
            });
        }
        
        this.updateWordScreen();
    }
    
    broadcastToPlayers(data, excludePeer = null) {
        Object.keys(this.connections).forEach(peerId => {
            if (peerId !== excludePeer && this.connections[peerId].open) {
                try {
                    this.connections[peerId].send(data);
                } catch (err) {
                    console.error('Ошибка отправки:', err);
                }
            }
        });
    }
    
    addPlayer(playerData) {
        const existingPlayer = this.state.players.find(p => p.id === playerData.id);
        
        if (existingPlayer) {
            console.log('Игрок уже существует:', playerData.name);
            return;
        }
        
        console.log('Добавляем нового игрока:', playerData.name);
        this.state.players.push(playerData);
        this.updateLobbyUI();
        this.addChatMessage(`${playerData.name} присоединился к игре!`);
        
        const updateData = {
            type: 'PLAYERS_UPDATE',
            players: this.state.players
        };
        
        this.broadcastToPlayers(updateData);
    }
    
    removePlayerByConnectionId(connectionId) {
        const player = this.state.players.find(p => p.connectionId === connectionId);
        if (player) {
            this.state.players = this.state.players.filter(p => p.connectionId !== connectionId);
            this.updateLobbyUI();
            this.addChatMessage(`${player.name} покинул игру.`);
            
            this.broadcastToPlayers({
                type: 'PLAYERS_UPDATE',
                players: this.state.players
            });
        }
    }
    
    updateLobbyUI() {
        document.getElementById('roomCodeDisplay').textContent = this.state.roomCode;
        document.getElementById('playersCount').textContent = this.state.players.length;
        
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        this.state.players.forEach(player => {
            const isYou = player.id === this.state.playerId;
            const playerEl = document.createElement('div');
            playerEl.className = `player-item ${player.isHost ? 'host' : ''} ${isYou ? 'you' : ''}`;
            
            const firstLetter = player.name.charAt(0).toUpperCase();
            
            playerEl.innerHTML = `
                <div class="player-avatar">${firstLetter}</div>
                <div class="player-info">
                    <h4>${player.name}</h4>
                    ${player.isHost ? '<span class="player-badge badge-host">Хост</span>' : ''}
                    ${isYou ? '<span class="player-badge badge-you">Вы</span>' : ''}
                </div>
            `;
            
            playersList.appendChild(playerEl);
        });
        
        const startBtn = document.getElementById('startGameBtn');
        const backToGameBtn = document.getElementById('backToGameBtn');
        
        if (this.state.gameStarted) {
            if (backToGameBtn) {
                backToGameBtn.disabled = false;
                backToGameBtn.style.display = 'inline-flex';
                if (!this.state.allWordsSubmitted) {
                    backToGameBtn.innerHTML = `<i class="fas fa-pencil-alt"></i> Вернуться к вводу слов`;
                } else {
                    backToGameBtn.innerHTML = `<i class="fas fa-gamepad"></i> Вернуться в игру`;
                }
            }
            if (startBtn) startBtn.style.display = 'none';
        } else {
            if (backToGameBtn) backToGameBtn.style.display = 'none';
            if (startBtn) {
                if (this.state.isHost) {
                    startBtn.disabled = this.state.players.length < 3;
                    startBtn.style.display = 'inline-flex';
                    startBtn.innerHTML = `<i class="fas fa-play"></i> Начать игру (${this.state.players.length}/3+)`;
                } else {
                    startBtn.disabled = true;
                    startBtn.style.display = 'inline-flex';
                    startBtn.innerHTML = `<i class="fas fa-clock"></i> Ожидаем начала от хоста`;
                }
            }
        }
    }
    
    copyRoomCode() {
        navigator.clipboard.writeText(this.state.roomCode)
            .then(() => {
                this.showNotification('Код скопирован в буфер обмена!');
            })
            .catch(err => {
                console.error('Ошибка копирования:', err);
                this.showNotification('Не удалось скопировать код');
            });
    }
    
    startGame() {
        if (this.state.players.length < 3) {
            this.showNotification('Нужно минимум 3 игрока для начала игры');
            return;
        }
        
        this.state.gameStarted = true;
        this.state.currentWriter = 0;
        this.state.words = {};
        this.state.allWordsSubmitted = false;
        
        this.broadcastToPlayers({
            type: 'START_GAME'
        });
        
        this.showWordScreen();
    }
    
    backToGame() {
        if (this.state.gameStarted) {
            if (!this.state.allWordsSubmitted) {
                this.showWordScreen();
            } else {
                this.showGameScreen();
            }
        }
    }
    
    showWordScreen() {
        this.showScreen('word');
        this.updateWordScreen();
    }
    
    updateWordScreen() {
        if (!this.state.gameStarted || this.state.allWordsSubmitted) {
            return;
        }
        
        const totalPlayers = this.state.players.length;
        
        if (totalPlayers === 0) {
            this.showNotification('Нет игроков в комнате');
            return;
        }
        
        const writtenWordsCount = Object.keys(this.state.words).length;
        if (writtenWordsCount >= totalPlayers) {
            setTimeout(() => {
                this.showGameScreen();
            }, 1000);
            return;
        }
        
        document.getElementById('currentPlayerNum').textContent = this.state.currentWriter + 1;
        document.getElementById('totalPlayers').textContent = totalPlayers;
        document.getElementById('completedWords').textContent = writtenWordsCount;
        
        const progress = (writtenWordsCount / totalPlayers) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        
        if (this.state.currentWriter >= this.state.players.length) {
            this.state.currentWriter = 0;
        }
        
        const currentPlayer = this.state.players[this.state.currentWriter];
        const targetIndex = (this.state.currentWriter + 1) % totalPlayers;
        const targetPlayer = this.state.players[targetIndex];
        
        if (!currentPlayer || !targetPlayer) {
            return;
        }
        
        document.getElementById('currentWriter').textContent = currentPlayer.name;
        document.getElementById('targetPlayer').textContent = targetPlayer.name;
        
        const isMyTurn = currentPlayer.id === this.state.playerId;
        const inputArea = document.getElementById('inputArea');
        const waitingArea = document.getElementById('waitingArea');
        
        const alreadyWroteForTarget = this.state.words[targetPlayer.id] !== undefined;
        
        if (isMyTurn && !alreadyWroteForTarget) {
            inputArea.classList.remove('hidden');
            waitingArea.classList.add('hidden');
            document.getElementById('wordInput').focus();
        } else {
            inputArea.classList.add('hidden');
            waitingArea.classList.remove('hidden');
            
            if (alreadyWroteForTarget) {
                document.getElementById('waitingForPlayer').innerHTML = `
                    Вы уже написали слово для ${targetPlayer.name}<br>
                    Ждём других игроков...
                `;
            } else {
                document.getElementById('waitingForPlayer').textContent = currentPlayer.name;
            }
        }
    }
    
    submitWord() {
        const input = document.getElementById('wordInput');
        const word = input.value.trim();
        
        if (!word) {
            this.showNotification('Введите слово');
            return;
        }
        
        if (word.length > 30) {
            this.showNotification('Слишком длинное слово (макс. 30 символов)');
            return;
        }
        
        const totalPlayers = this.state.players.length;
        const targetIndex = (this.state.currentWriter + 1) % totalPlayers;
        const targetPlayer = this.state.players[targetIndex];
        
        if (!targetPlayer) {
            this.showNotification('Ошибка: игрок не найден');
            return;
        }
        
        if (this.state.words[targetPlayer.id]) {
            this.showNotification('Вы уже написали слово для этого игрока');
            return;
        }
        
        this.state.words[targetPlayer.id] = {
            word: word,
            author: this.state.playerName
        };
        
        const message = {
            type: 'WORD_SUBMITTED',
            word: word,
            targetPlayerId: targetPlayer.id,
            authorName: this.state.playerName,
            authorId: this.state.playerId
        };
        
        if (this.state.isHost) {
            this.handleWordSubmitted(message);
        } else if (this.hostConnection) {
            this.hostConnection.send(message);
        }
        
        input.value = '';
        this.updateWordScreen();
        this.showNotification('Слово отправлено!');
    }
    
    showGameScreen() {
        this.showScreen('game');
        document.getElementById('myPlayerName').textContent = this.state.playerName;
        this.updateGameUI();
        this.updateLobbyUI();
    }
    
    updateGameUI() {
        const otherPlayersContainer = document.getElementById('otherPlayers');
        otherPlayersContainer.innerHTML = '';
        
        this.state.players.forEach((player) => {
            if (player.id === this.state.playerId) return;
            
            const wordData = this.state.words[player.id];
            const playerEl = document.createElement('div');
            playerEl.className = 'other-player';
            
            const firstLetter = player.name.charAt(0).toUpperCase();
            
            playerEl.innerHTML = `
                <div class="player-avatar">${firstLetter}</div>
                <h4>${player.name}</h4>
                <div class="word">${wordData ? wordData.word : 'Слово не задано'}</div>
                <p><small>Слово написал: ${wordData ? wordData.author : '?'}</small></p>
            `;
            
            otherPlayersContainer.appendChild(playerEl);
        });
    }
    
    newGame() {
        if (this.state.isHost) {
            this.state.words = {};
            this.state.currentWriter = 0;
            this.state.allWordsSubmitted = false;
            this.broadcastToPlayers({ type: 'START_GAME' });
            this.showWordScreen();
        }
    }
    
    backToLobby() {
        this.showScreen('lobby');
        this.updateLobbyUI();
    }
    
    cleanup() {
        if (this.peer) {
            // Отправляем сообщение о выходе всем
            if (this.state.isHost) {
                this.broadcastToPlayers({
                    type: 'PLAYER_LEFT',
                    playerId: this.state.playerId,
                    connectionId: this.peer.id
                });
            } else if (this.hostConnection) {
                this.hostConnection.send({
                    type: 'PLAYER_LEFT',
                    playerId: this.state.playerId,
                    connectionId: this.peer.id
                });
            }
            
            // Закрываем все соединения
            Object.keys(this.connections).forEach(peerId => {
                try {
                    this.connections[peerId].close();
                } catch (e) {}
            });
            
            // Закрываем peer
            this.peer.destroy();
        }
    }
    
    leaveLobby() {
        if (confirm('Вы уверены, что хотите покинуть комнату?')) {
            this.cleanup();
            
            // Сбрасываем состояние
            this.state = {
                screen: 'login',
                playerId: this.state.playerId,
                playerName: '',
                roomCode: '',
                isHost: false,
                players: [],
                words: {},
                currentWriter: 0,
                gameStarted: false,
                allWordsSubmitted: false
            };
            
            this.connections = {};
            this.hostConnection = null;
            this.peer = null;
            this.playerAdded = false;
            this.connectionAttempts = 0;
            this.messageHistory = [];
            
            document.getElementById('roomCode').value = '';
            document.getElementById('chatMessages').innerHTML = `
                <div class="message system">
                    <span class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    Добро пожаловать в комнату!
                </div>
            `;
            
            this.showScreen('login');
            this.showNotification('Вы покинули комнату');
        }
    }
    
    // Добавим метод для проверки WebRTC
    checkWebRTC() {
        const support = {
            RTCPeerConnection: !!window.RTCPeerConnection,
            RTCSessionDescription: !!window.RTCSessionDescription,
            RTCIceCandidate: !!window.RTCIceCandidate,
            dataChannel: false
        };
        
        if (support.RTCPeerConnection) {
            try {
                const pc = new RTCPeerConnection();
                support.dataChannel = !!pc.createDataChannel;
                pc.close();
            } catch (e) {}
        }
        
        console.log('WebRTC support:', support);
        return support;
    }
}

// Инициализация игры после загрузки страницы
window.addEventListener('DOMContentLoaded', () => {
    const game = new WhoAmIGame();
    window.game = game;
    
    // Проверка WebRTC при загрузке
    const support = game.checkWebRTC();
    
    if (game.isWebKit && (!support.RTCPeerConnection || !support.dataChannel)) {
        console.warn('Limited WebRTC support in Safari');
        const iosWarning = document.getElementById('iosWarning');
        if (iosWarning) {
            iosWarning.innerHTML += 
                '<br><strong>⚠️ WebRTC может не работать в Safari. Используйте Chrome для iOS.</strong>';
        }
    }
    
    console.log('Игра загружена. Для отладки используйте window.game');
});