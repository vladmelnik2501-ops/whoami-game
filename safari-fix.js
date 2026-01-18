// safari-fix.js - исправления для Safari/WebKit
(function() {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isWebKit = isSafari || isIOS;
    
    if (isWebKit) {
        console.log('Applying Safari/WebKit fixes');
        
        // 1. Полифилл для отсутствующих WebRTC API
        if (typeof RTCPeerConnection === 'undefined') {
            window.RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        }
        
        // 2. Исправление для старых Safari
        if (!window.RTCSessionDescription && window.webkitRTCSessionDescription) {
            window.RTCSessionDescription = window.webkitRTCSessionDescription;
        }
        
        if (!window.RTCIceCandidate && window.webkitRTCIceCandidate) {
            window.RTCIceCandidate = window.webkitRTCIceCandidate;
        }
        
        // 3. Запрашиваем разрешения при загрузке
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    // Запрашиваем фиктивные разрешения для активации WebRTC
                    navigator.mediaDevices.getUserMedia({ audio: false, video: false })
                        .then(function(stream) {
                            console.log('Safari WebRTC activated');
                            stream.getTracks().forEach(track => track.stop());
                        })
                        .catch(function(err) {
                            console.log('Safari WebRTC activation failed:', err.name);
                        });
                }
                
                // Предупреждение для пользователя Safari
                if (isIOS && !window.RTCPeerConnection) {
                    const warning = document.createElement('div');
                    warning.style.cssText = `
                        background: #ff6b6b;
                        color: white;
                        padding: 10px;
                        text-align: center;
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        z-index: 9999;
                        font-size: 14px;
                    `;
                    warning.innerHTML = `
                        <strong>⚠️ Safari не поддерживает игру полностью.</strong>
                        <span style="margin-left: 10px;">
                            Используйте <a href="#" onclick="window.open(window.location.href, '_blank'); return false;" style="color: white; text-decoration: underline;">Chrome для iOS</a>
                        </span>
                    `;
                    document.body.appendChild(warning);
                }
            }, 1000);
        });
        
        // 4. Исправление для PeerJS в Safari
        const originalPeer = window.Peer;
        if (originalPeer) {
            window.Peer = function(id, options) {
                // Форсируем настройки для Safari
                if (isWebKit) {
                    options = options || {};
                    options.config = options.config || {};
                    options.config.iceServers = options.config.iceServers || [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ];
                    
                    // Используем облачный сервер
                    if (!options.host) {
                        options.host = '0.peerjs.com';
                        options.port = 443;
                        options.secure = true;
                        options.proxied = true;
                    }
                    
                    options.debug = 2;
                    
                    // Важно для Safari!
                    options.constraints = options.constraints || {
                        optional: [
                            { DtlsSrtpKeyAgreement: true },
                            { RtpDataChannels: true }
                        ]
                    };
                }
                
                return new originalPeer(id, options);
            };
            
            // Копируем статические методы
            for (const key in originalPeer) {
                if (originalPeer.hasOwnProperty(key)) {
                    window.Peer[key] = originalPeer[key];
                }
            }
        }
    }
})();