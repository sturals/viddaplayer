/**
 * VIDAA TV PLAYER - Core Application Script
 * 
 * Features:
 * - HLS.js + Native HTML5 video streaming engine
 * - Pitch-preserved Speed Control (0.25x - 3.0x)
 * - Audio Track & Subtitle Selector
 * - Full D-Pad Remote Navigation System
 * - Local Storage History & Resume Playback
 * - Virtual On-Screen TV Keyboard
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // STATE & DOM ELEMENTS
    // =========================================================================
    const state = {
        currentScreen: 'start-screen', // 'start-screen' | 'player-screen'
        currentUrl: '',
        hlsEngine: null,
        isPlaying: false,
        playbackSpeed: 1.0,
        osdTimeout: null,
        osdVisible: true,
        activeMenu: null, // null | 'speed-menu' | 'audio-menu' | 'subtitle-menu'
        history: JSON.parse(localStorage.getItem('vidaa_player_history') || '[]'),
        savedPositions: JSON.parse(localStorage.getItem('vidaa_player_positions') || '{}'),
        focusedElement: null,
        toastTimeout: null,
        tvId: null,
        peerId: null,
        peerInstance: null
    };

    // DOM Elements
    const elements = {
        // Screens
        startScreen: document.getElementById('start-screen'),
        playerScreen: document.getElementById('player-screen'),
        
        // Input & Start
        urlInput: document.getElementById('url-input'),
        btnPlayUrl: document.getElementById('btn-play-url'),
        btnToggleKeyboard: document.getElementById('btn-toggle-keyboard'),
        btnPasteDemo: document.getElementById('btn-paste-demo'),
        btnQrSync: document.getElementById('btn-qr-sync'),
        qrModal: document.getElementById('qr-modal'),
        qrImage: document.getElementById('qr-image'),
        qrUrlLink: document.getElementById('qr-url-link'),
        tvCodeDisplay: document.getElementById('tv-code-display'),
        btnCloseQr: document.getElementById('btn-close-qr'),
        virtualKeyboard: document.getElementById('virtual-keyboard'),
        historyList: document.getElementById('history-list'),
        btnClearHistory: document.getElementById('btn-clear-history'),
        liveClock: document.getElementById('live-clock'),
        osdLiveClock: document.getElementById('osd-live-clock'),

        // Player
        video: document.getElementById('video-player'),
        osdOverlay: document.getElementById('osd-overlay'),
        videoTitle: document.getElementById('osd-video-title'),
        playerLoader: document.getElementById('player-loader'),
        loaderText: document.getElementById('loader-text'),
        playerError: document.getElementById('player-error'),
        errorMessage: document.getElementById('error-message'),
        btnErrorBack: document.getElementById('btn-error-back'),
        toast: document.getElementById('toast'),

        // Progress & Time
        progressWrapper: document.getElementById('progress-wrapper'),
        progressPlayed: document.getElementById('progress-played'),
        progressBuffered: document.getElementById('progress-buffered'),
        progressScrubber: document.getElementById('progress-scrubber'),
        timeCurrent: document.getElementById('time-current'),
        timeDuration: document.getElementById('time-duration'),

        // OSD Buttons
        btnOsdBack: document.getElementById('btn-osd-back'),
        btnRewind: document.getElementById('btn-rewind'),
        btnPlayPause: document.getElementById('btn-play-pause'),
        btnForward: document.getElementById('btn-forward'),
        iconPlay: document.getElementById('icon-play'),
        iconPause: document.getElementById('icon-pause'),
        
        // Menus
        btnSpeed: document.getElementById('btn-speed'),
        speedLabel: document.getElementById('speed-label'),
        speedMenu: document.getElementById('speed-menu'),
        speedOptions: document.getElementById('speed-options'),
        
        btnQuality: document.getElementById('btn-quality'),
        qualityLabel: document.getElementById('quality-label'),
        qualityMenu: document.getElementById('quality-menu'),
        qualityOptions: document.getElementById('quality-options'),

        btnAudio: document.getElementById('btn-audio'),
        audioLabel: document.getElementById('audio-label'),
        audioMenu: document.getElementById('audio-menu'),
        audioOptions: document.getElementById('audio-options'),

        btnSubtitles: document.getElementById('btn-subtitles'),
        subLabel: document.getElementById('sub-label'),
        subtitleMenu: document.getElementById('subtitle-menu'),
        subtitleOptions: document.getElementById('subtitle-options')
    };

    // Sample Demo HLS Stream
    const DEMO_HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    function init() {
        let savedId = localStorage.getItem('vidaa_tv_id');
        if (!savedId) {
            // Generate a secure 6-character alphanumeric ID to prevent guessing
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let randomStr = '';
            for (let i = 0; i < 6; i++) {
                randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            savedId = 'tv_' + randomStr;
            localStorage.setItem('vidaa_tv_id', savedId);
        }
        state.tvId = savedId;

        startClock();
        renderHistory();
        setupEventListeners();
        setupKeyboardInput();
        startPeerJs();
        checkUrlParam();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }

        // Initial focus on URL Input
        setFocus(elements.urlInput);
    }

    // Check if page was opened with ?url= parameter
    function checkUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const urlParam = params.get('url');
        if (urlParam) {
            elements.urlInput.value = urlParam;
            loadVideo(urlParam);
        }
    }

    // Safely construct remote.html URL with TV parameter
    function getRemoteUrl() {
        const loc = window.location;
        let path = loc.pathname;
        if (path.endsWith('/') || path === '') {
            path += 'remote.html';
        } else {
            path = path.substring(0, path.lastIndexOf('/') + 1) + 'remote.html';
        }
        return `${loc.protocol}//${loc.host}${path}?tv=${state.tvId || 'default'}`;
    }

    // =========================================================================
    // PEER.JS SERVERLESS PHONE REMOTE
    // =========================================================================
    function startPeerJs() {
        if (!state.tvId || typeof Peer === 'undefined') return;
        
        const peerId = 'vidaatv-' + state.tvId;
        const peer = new Peer(peerId);
        
        peer.on('open', (id) => {
            console.log('TV Remote Peer ID:', id);
        });
        
        peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data && data.url) {
                    showToast('📡 Ссылка получена с телефона!');
                    elements.urlInput.value = data.url;
                    loadVideo(data.url);
                } else if (data && data.command === 'play_pause') {
                    togglePlayPause();
                } else if (data && data.command === 'stop') {
                    if (state.currentScreen === 'player-screen') {
                        exitPlayer();
                    }
                }
            });
        });
        
        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
        });
    }

    // Live Clock Updater
    function startClock() {
        function update() {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            elements.liveClock.textContent = timeStr;
            elements.osdLiveClock.textContent = timeStr;
        }
        update();
        setInterval(update, 1000);
    }

    // =========================================================================
    // FOCUS & D-PAD NAVIGATION SYSTEM
    // =========================================================================
    function setFocus(element) {
        if (!element) return;
        if (state.focusedElement) {
            state.focusedElement.classList.remove('focused');
        }
        state.focusedElement = element;
        element.classList.add('focused');
        element.focus();

        // Scroll element into view smoothly if inside scrollable container
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    function getFocusableElements() {
        if (state.currentScreen === 'start-screen') {
            return Array.from(elements.startScreen.querySelectorAll('.focusable')).filter(el => {
                if (el.classList.contains('hidden')) return false;
                if (el.closest('.hidden')) return false;
                return el.offsetParent !== null || window.getComputedStyle(el).display !== 'none';
            });
        } else {
            // Player screen: check if a menu is open
            if (state.activeMenu) {
                const menuEl = document.getElementById(state.activeMenu);
                return Array.from(menuEl.querySelectorAll('.focusable')).filter(el => !el.classList.contains('hidden'));
            }
            if (elements.playerError.classList.contains('hidden') === false) {
                return [elements.btnErrorBack];
            }
            return Array.from(elements.osdOverlay.querySelectorAll('.focusable')).filter(el => !el.classList.contains('hidden'));
        }
    }

    function handleSpatialNavigation(direction) {
        const focusables = getFocusableElements();
        if (!focusables.length) return;

        const current = state.focusedElement || focusables[0];
        const currentRect = current.getBoundingClientRect();

        let bestMatch = null;
        let minDistance = Infinity;

        focusables.forEach(candidate => {
            if (candidate === current) return;
            const candRect = candidate.getBoundingClientRect();

            let dx = 0;
            let dy = 0;
            let isValidDirection = false;

            switch (direction) {
                case 'left':
                    dx = currentRect.left - candRect.right;
                    dy = Math.abs((currentRect.top + currentRect.height / 2) - (candRect.top + candRect.height / 2));
                    isValidDirection = candRect.right <= currentRect.left + 10;
                    break;
                case 'right':
                    dx = candRect.left - currentRect.right;
                    dy = Math.abs((currentRect.top + currentRect.height / 2) - (candRect.top + candRect.height / 2));
                    isValidDirection = candRect.left >= currentRect.right - 10;
                    break;
                case 'up':
                    dy = currentRect.top - candRect.bottom;
                    dx = Math.abs((currentRect.left + currentRect.width / 2) - (candRect.left + candRect.width / 2));
                    isValidDirection = candRect.bottom <= currentRect.top + 10;
                    break;
                case 'down':
                    dy = candRect.top - currentRect.bottom;
                    dx = Math.abs((currentRect.left + currentRect.width / 2) - (candRect.left + candRect.width / 2));
                    isValidDirection = candRect.top >= currentRect.bottom - 10;
                    break;
            }

            if (isValidDirection) {
                // Weighted distance favoring the movement axis
                const distance = dx * dx + dy * dy * 2;
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = candidate;
                }
            }
        });

        if (bestMatch) {
            setFocus(bestMatch);
        }
    }

    // =========================================================================
    // EVENT LISTENERS & REMOTE CONTROL CONTROLS
    // =========================================================================
    function setupEventListeners() {
        // Global Keydown Handler for TV Remote Controls
        document.addEventListener('keydown', (e) => {
            const isInputFocused = (document.activeElement === elements.urlInput);

            // Wake up OSD if video is playing
            if (state.currentScreen === 'player-screen' && !state.activeMenu) {
                showOSD();
            }

            switch (e.key) {
                case '7':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        seekRelative(-5);
                    }
                    break;

                case '9':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        seekRelative(5);
                    }
                    break;

                case '4':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        seekRelative(-10);
                    }
                    break;

                case '6':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        seekRelative(10);
                    }
                    break;

                case '5':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        togglePlayPause();
                    }
                    break;

                case '1':
                    if (!isInputFocused && state.currentScreen === 'player-screen') {
                        e.preventDefault();
                        showOSD(true);
                        setFocus(elements.btnPlayPause);
                    }
                    break;

                case 'ArrowLeft':
                    if (isInputFocused) {
                        // Allow natural text cursor movement inside input
                        return;
                    }
                    e.preventDefault();
                    if (state.currentScreen === 'player-screen' && state.focusedElement === elements.progressWrapper) {
                        seekRelative(-10);
                    } else {
                        handleSpatialNavigation('left');
                    }
                    break;

                case 'ArrowRight':
                    if (isInputFocused) {
                        // Allow natural text cursor movement inside input
                        return;
                    }
                    e.preventDefault();
                    if (state.currentScreen === 'player-screen' && state.focusedElement === elements.progressWrapper) {
                        seekRelative(10);
                    } else {
                        handleSpatialNavigation('right');
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (state.currentScreen === 'player-screen') {
                        showOSD();
                        const osdFocusables = Array.from(elements.osdOverlay.querySelectorAll('.focusable'));
                        if (!state.focusedElement || !osdFocusables.includes(state.focusedElement)) {
                            setFocus(elements.btnPlayPause);
                            return;
                        }
                    }
                    handleSpatialNavigation('up');
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    if (state.currentScreen === 'player-screen') {
                        showOSD();
                        const osdFocusables = Array.from(elements.osdOverlay.querySelectorAll('.focusable'));
                        if (!state.focusedElement || !osdFocusables.includes(state.focusedElement)) {
                            setFocus(elements.btnPlayPause);
                            return;
                        }
                    }
                    handleSpatialNavigation('down');
                    break;

                case 'Enter':
                    // Trigger click on focused element
                    if (state.focusedElement) {
                        e.preventDefault();
                        state.focusedElement.click();
                    }
                    break;

                case 'Escape':
                case 'Backspace':
                    if (isInputFocused && e.key === 'Backspace') {
                        // Allow normal character deletion inside input field
                        return;
                    }
                    // TV Return / Back key
                    e.preventDefault();
                    handleBackNavigation();
                    break;

                case 'MediaPlayPause':
                    e.preventDefault();
                    togglePlayPause();
                    break;

                case 'MediaFastForward':
                    e.preventDefault();
                    seekRelative(10);
                    break;

                case 'MediaRewind':
                    e.preventDefault();
                    seekRelative(-10);
                    break;
            }
        });

        // Tap/Click on video to toggle OSD on mobile/touch screens
        elements.video.addEventListener('click', () => {
            if (state.currentScreen === 'player-screen') {
                if (state.osdVisible && !elements.video.paused && !state.activeMenu) {
                    elements.osdOverlay.classList.add('hidden');
                    state.osdVisible = false;
                } else {
                    showOSD();
                }
            }
        });

        // Click handlers
        elements.btnPlayUrl.addEventListener('click', () => {
            const url = elements.urlInput.value.trim();
            if (url) loadVideo(url);
            else showToast('Пожалуйста, введите ссылку на видео');
        });

        elements.btnPasteDemo.addEventListener('click', () => {
            elements.urlInput.value = DEMO_HLS_URL;
            loadVideo(DEMO_HLS_URL);
        });

        elements.btnQrSync.addEventListener('click', () => {
            const remoteUrl = getRemoteUrl();
            if (elements.qrUrlLink) {
                elements.qrUrlLink.href = remoteUrl;
                elements.qrUrlLink.textContent = remoteUrl;
            }

            const qrBox = document.getElementById('qr-code-box');
            if (qrBox) {
                qrBox.innerHTML = '';
                if (typeof QRCode !== 'undefined') {
                    new QRCode(qrBox, {
                        text: remoteUrl,
                        width: 220,
                        height: 220,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } else {
                    qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(remoteUrl)}" alt="QR">`;
                }
            }

            elements.qrModal.classList.remove('hidden');
            setFocus(elements.btnCloseQr);
        });

        elements.btnCloseQr.addEventListener('click', () => {
            elements.qrModal.classList.add('hidden');
            setFocus(elements.btnQrSync);
        });

        elements.btnToggleKeyboard.addEventListener('click', () => {
            elements.virtualKeyboard.classList.toggle('hidden');
            if (!elements.virtualKeyboard.classList.contains('hidden')) {
                const firstKey = elements.virtualKeyboard.querySelector('.kb-key');
                if (firstKey) setFocus(firstKey);
            } else {
                setFocus(elements.urlInput);
            }
        });

        elements.btnClearHistory.addEventListener('click', clearHistory);

        // Player Controls
        function handleSeekClick(e) {
            if (!elements.video.duration) return;
            const rect = elements.progressWrapper.getBoundingClientRect();
            let pos = (e.clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(pos, 1));
            elements.video.currentTime = pos * elements.video.duration;
            showOSD();
        }
        elements.progressWrapper.addEventListener('click', handleSeekClick);
        elements.progressWrapper.addEventListener('dblclick', handleSeekClick);
        
        elements.btnPlayPause.addEventListener('click', togglePlayPause);
        elements.btnRewind.addEventListener('click', () => seekRelative(-10));
        elements.btnForward.addEventListener('click', () => seekRelative(10));
        elements.btnOsdBack.addEventListener('click', exitPlayer);
        elements.btnErrorBack.addEventListener('click', exitPlayer);

        // Popup Menus Toggles
        elements.btnSpeed.addEventListener('click', () => toggleMenu('speed-menu'));
        elements.btnQuality.addEventListener('click', () => toggleMenu('quality-menu'));
        elements.btnAudio.addEventListener('click', () => toggleMenu('audio-menu'));
        elements.btnSubtitles.addEventListener('click', () => toggleMenu('subtitle-menu'));

        // Speed Menu Selection
        elements.speedOptions.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-speed]');
            if (btn) {
                const speed = parseFloat(btn.dataset.speed);
                setPlaybackSpeed(speed);
                closeMenus();
                setFocus(elements.btnSpeed);
            }
        });

        // Video Player Native Events
        elements.video.addEventListener('play', () => {
            state.isPlaying = true;
            elements.iconPlay.classList.add('hidden');
            elements.iconPause.classList.remove('hidden');
            showOSD();
        });

        elements.video.addEventListener('pause', () => {
            state.isPlaying = false;
            elements.iconPlay.classList.remove('hidden');
            elements.iconPause.classList.add('hidden');
            showOSD(true); // Permanent OSD on pause
        });

        elements.video.addEventListener('timeupdate', updateProgress);
        elements.video.addEventListener('waiting', () => elements.playerLoader.classList.remove('hidden'));
        elements.video.addEventListener('playing', () => elements.playerLoader.classList.add('hidden'));
        elements.video.addEventListener('ended', () => {
            state.isPlaying = false;
            showOSD(true);
        });

        elements.video.addEventListener('error', (e) => {
            console.error('Video error event:', e);
            showError('Ошибка загрузки видео. Проверьте правильность ссылки или наличие доступа.');
        });
    }

    function handleBackNavigation() {
        // QR modal is global overlay — check first
        if (!elements.qrModal.classList.contains('hidden')) {
            elements.qrModal.classList.add('hidden');
            setFocus(elements.btnQrSync);
        } else if (state.activeMenu) {
            closeMenus();
            setFocus(elements.btnSpeed);
        } else if (state.currentScreen === 'player-screen') {
            exitPlayer();
        } else if (!elements.virtualKeyboard.classList.contains('hidden')) {
            elements.virtualKeyboard.classList.add('hidden');
            setFocus(elements.urlInput);
        }
    }

    // =========================================================================
    // VIRTUAL KEYBOARD INPUT
    // =========================================================================
    function setupKeyboardInput() {
        elements.virtualKeyboard.addEventListener('click', (e) => {
            const keyBtn = e.target.closest('.kb-key');
            if (!keyBtn) return;

            const char = keyBtn.dataset.key;
            const action = keyBtn.dataset.action;
            const preset = keyBtn.dataset.preset;

            if (char) {
                elements.urlInput.value += char;
            } else if (preset) {
                elements.urlInput.value += preset;
            } else if (action === 'backspace') {
                elements.urlInput.value = elements.urlInput.value.slice(0, -1);
            } else if (action === 'clear') {
                elements.urlInput.value = '';
            }
        });
    }

    // =========================================================================
    // VIDEO ENGINE (HLS.JS + NATIVE)
    // =========================================================================
    function loadVideo(url) {
        state.currentUrl = url;
        elements.videoTitle.textContent = getFileNameFromUrl(url);

        // Auto-close QR modal if open
        if (elements.qrModal) {
            elements.qrModal.classList.add('hidden');
        }

        // Switch to player screen
        switchScreen('player-screen');
        elements.playerLoader.classList.remove('hidden');
        elements.playerError.classList.add('hidden');

        // Reset HLS engine if existing
        if (state.hlsEngine) {
            state.hlsEngine.destroy();
            state.hlsEngine = null;
        }

        const isHls = url.includes('.m3u8') || url.includes('m3u8');

        if (isHls && Hls.isSupported()) {
            console.log('Initializing HLS.js for:', url);
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });

            state.hlsEngine = hls;
            hls.loadSource(url);
            hls.attachMedia(elements.video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                elements.playerLoader.classList.add('hidden');
                if (hls.audioTracks && hls.audioTracks.length > 0 && hls.audioTrack === -1) {
                    hls.audioTrack = 0;
                }
                setupHlsAudioTracks(hls);
                setupSubtitles(hls);
                setupHlsQuality(hls);
                applySavedPosition(url);
                playVideo();
            });

            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
                console.log('AUDIO_TRACKS_UPDATED:', data.audioTracks);
                if (hls.audioTrack === -1 && data.audioTracks && data.audioTracks.length > 0) {
                    hls.audioTrack = 0;
                }
                setupHlsAudioTracks(hls);
            });

            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
                console.log('SUBTITLE_TRACKS_UPDATED:', data.subtitleTracks);
                setupSubtitles(hls);
            });

            hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (event, data) => {
                console.log('SUBTITLE_TRACK_SWITCH:', data);
                setupSubtitles(hls);
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('Fatal HLS error:', data);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            showError('Сетевая ошибка при загрузке HLS потока. Проверьте CORS или интернет-соединение.');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            showError('Не удалось воспроизвести поток.');
                            break;
                    }
                }
            });
        } else {
            // Native HTML5 Video
            console.log('Playing native HTML5 video:', url);
            elements.video.src = url;
            elements.video.load();

            elements.video.addEventListener('canplay', () => {
                elements.playerLoader.classList.add('hidden');
                setupNativeAudioTracks();
                setupSubtitles(null);
                applySavedPosition(url);
                playVideo();
            }, { once: true });
        }

        saveToHistory(url);
        setFocus(elements.btnPlayPause);
    }

    function playVideo() {
        elements.video.muted = false;
        elements.video.volume = 1.0;
        setPlaybackSpeed(state.playbackSpeed);
        elements.video.play()
            .then(() => {
                state.isPlaying = true;
                showOSD();
            })
            .catch(err => {
                console.warn('Autoplay blocked or failed:', err);
                showOSD(true);
            });
    }

    function togglePlayPause() {
        if (elements.video.paused) {
            elements.video.play();
        } else {
            elements.video.pause();
        }
    }

    function seekRelative(seconds) {
        if (!elements.video.duration) return;
        let newTime = elements.video.currentTime + seconds;
        newTime = Math.max(0, Math.min(newTime, elements.video.duration));
        elements.video.currentTime = newTime;
        showToast(`${seconds > 0 ? '+' : ''}${seconds} сек`);
        showOSD();
    }

    function exitPlayer() {
        // Save current position
        if (state.currentUrl && elements.video.currentTime > 5) {
            state.savedPositions[state.currentUrl] = Math.floor(elements.video.currentTime);
            localStorage.setItem('vidaa_player_positions', JSON.stringify(state.savedPositions));
        }

        elements.video.pause();
        if (state.hlsEngine) {
            state.hlsEngine.destroy();
            state.hlsEngine = null;
        }
        elements.video.src = '';
        
        switchScreen('start-screen');
        renderHistory();
        setFocus(elements.urlInput);
    }

    function applySavedPosition(url) {
        const pos = state.savedPositions[url];
        if (pos && pos > 5) {
            elements.video.currentTime = pos;
            showToast(`Продолжено с ${formatTime(pos)}`);
        }
    }

    // =========================================================================
    // SPEED CONTROL (WITH PITCH PRESERVATION)
    // =========================================================================
    function setPlaybackSpeed(speed) {
        state.playbackSpeed = speed;
        elements.video.playbackRate = speed;

        // Enable Pitch Preservation for TV Audio Engines
        if ('preservesPitch' in elements.video) {
            elements.video.preservesPitch = true;
        } else if ('webkitPreservesPitch' in elements.video) {
            elements.video.webkitPreservesPitch = true;
        } else if ('mozPreservesPitch' in elements.video) {
            elements.video.mozPreservesPitch = true;
        }

        elements.speedLabel.textContent = `${speed}x`;
        showToast(`Скорость: ${speed}x`);

        // Highlight selected speed option in menu
        Array.from(elements.speedOptions.children).forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
        });
    }

    // =========================================================================
    // AUDIO TRACKS & SUBTITLES MANAGER
    // =========================================================================
    function setupHlsAudioTracks(hls) {
        const tracks = hls.audioTracks;
        elements.audioOptions.innerHTML = '';

        if (!tracks || tracks.length === 0) {
            elements.audioOptions.innerHTML = '<div class="menu-item">Стандартная дорожка</div>';
            return;
        }

        // Auto select first audio track if none selected
        if (hls.audioTrack === -1 && tracks.length > 0) {
            hls.audioTrack = 0;
        }

        tracks.forEach((track, index) => {
            const btn = document.createElement('button');
            btn.className = `menu-item focusable ${index === hls.audioTrack ? 'active' : ''}`;
            const name = track.name || track.lang || `Дорожка ${index + 1}`;
            btn.textContent = name;
            btn.addEventListener('click', () => {
                hls.audioTrack = index;
                showToast(`Аудио: ${name}`);
                setupHlsAudioTracks(hls);
                closeMenus();
            });
            elements.audioOptions.appendChild(btn);
        });
    }

    function setupNativeAudioTracks() {
        elements.audioOptions.innerHTML = '<div class="menu-item">Стандартное аудио</div>';
    }

    function setupSubtitles(hls) {
        elements.subtitleOptions.innerHTML = '';

        const offBtn = document.createElement('button');
        const isOff = (!hls || hls.subtitleTrack === -1) &&
            (!elements.video.textTracks || Array.from(elements.video.textTracks).every(t => t.mode === 'disabled' || t.mode === 'hidden'));

        offBtn.className = `menu-item focusable ${isOff ? 'active' : ''}`;
        offBtn.textContent = 'Выключить';
        offBtn.addEventListener('click', () => {
            if (hls) hls.subtitleTrack = -1;
            if (elements.video.textTracks) {
                Array.from(elements.video.textTracks).forEach(t => t.mode = 'disabled');
            }
            showToast('Субтитры выключены');
            setupSubtitles(hls);
            closeMenus();
        });
        elements.subtitleOptions.appendChild(offBtn);

        let count = 0;

        // 1. HLS Subtitle Tracks (WebVTT / VTT playlists)
        if (hls && hls.subtitleTracks && hls.subtitleTracks.length > 0) {
            hls.subtitleTracks.forEach((sub, index) => {
                count++;
                const btn = document.createElement('button');
                btn.className = `menu-item focusable ${index === hls.subtitleTrack ? 'active' : ''}`;
                const label = sub.name || sub.lang || `Субтитры HLS ${index + 1}`;
                btn.textContent = label;
                btn.addEventListener('click', () => {
                    hls.subtitleTrack = index;
                    if (elements.video.textTracks) {
                        Array.from(elements.video.textTracks).forEach(t => t.mode = 'disabled');
                    }
                    showToast(`Субтитры: ${label}`);
                    setupSubtitles(hls);
                    closeMenus();
                });
                elements.subtitleOptions.appendChild(btn);
            });
        }

        // 2. Native HTML5 textTracks (In-band WebVTT / CEA-608 captions)
        if (elements.video.textTracks && elements.video.textTracks.length > 0) {
            Array.from(elements.video.textTracks).forEach((track, index) => {
                if (track.kind === 'metadata' || track.kind === 'chapters') return;

                count++;
                const btn = document.createElement('button');
                const isShowing = track.mode === 'showing';
                btn.className = `menu-item focusable ${isShowing ? 'active' : ''}`;
                const label = track.label || track.language || `Субтитры ${track.kind || ''} ${index + 1}`;
                btn.textContent = label;
                btn.addEventListener('click', () => {
                    if (hls) hls.subtitleTrack = -1;
                    Array.from(elements.video.textTracks).forEach((t, i) => {
                        t.mode = (i === index) ? 'showing' : 'disabled';
                    });
                    showToast(`Субтитры: ${label}`);
                    setupSubtitles(hls);
                    closeMenus();
                });
                elements.subtitleOptions.appendChild(btn);
            });
        }

        if (count === 0) {
            const noSubBtn = document.createElement('div');
            noSubBtn.className = 'menu-item';
            noSubBtn.textContent = 'Субтитры не найдены';
            elements.subtitleOptions.appendChild(noSubBtn);
        }
    }

    function setupHlsQuality(hls) {
        if (!hls || !hls.levels || hls.levels.length <= 1) {
            elements.btnQuality.classList.add('hidden');
            return;
        }
        elements.btnQuality.classList.remove('hidden');
        elements.qualityOptions.innerHTML = '';

        const autoBtn = document.createElement('button');
        autoBtn.className = `menu-item focusable ${hls.currentLevel === -1 ? 'active' : ''}`;
        autoBtn.textContent = 'Автоматически';
        autoBtn.addEventListener('click', () => {
            hls.currentLevel = -1;
            elements.qualityLabel.textContent = 'Авто';
            showToast('Качество: Авто');
            setupHlsQuality(hls);
            closeMenus();
        });
        elements.qualityOptions.appendChild(autoBtn);

        hls.levels.forEach((level, index) => {
            const btn = document.createElement('button');
            btn.className = `menu-item focusable ${hls.currentLevel === index ? 'active' : ''}`;
            const name = level.height ? `${level.height}p` : `Качество ${index + 1}`;
            btn.textContent = name;
            btn.addEventListener('click', () => {
                hls.currentLevel = index;
                elements.qualityLabel.textContent = name;
                showToast(`Качество: ${name}`);
                setupHlsQuality(hls);
                closeMenus();
            });
            elements.qualityOptions.appendChild(btn);
        });
        
        // Update label initially
        if (hls.currentLevel === -1) {
            elements.qualityLabel.textContent = 'Авто';
        } else if (hls.levels[hls.currentLevel]) {
            elements.qualityLabel.textContent = hls.levels[hls.currentLevel].height ? `${hls.levels[hls.currentLevel].height}p` : `Качество ${hls.currentLevel + 1}`;
        }
    }

    // =========================================================================
    // PROGRESS BAR & OSD MANAGEMENT
    // =========================================================================
    function updateProgress() {
        if (!elements.video.duration) return;
        const current = elements.video.currentTime;
        const duration = elements.video.duration;
        const pct = (current / duration) * 100;

        elements.progressPlayed.style.width = `${pct}%`;
        elements.progressScrubber.style.left = `${pct}%`;
        elements.timeCurrent.textContent = formatTime(current);
        elements.timeDuration.textContent = formatTime(duration);

        // Update Buffer
        if (elements.video.buffered.length > 0) {
            const bufferedEnd = elements.video.buffered.end(elements.video.buffered.length - 1);
            const bufPct = (bufferedEnd / duration) * 100;
            elements.progressBuffered.style.width = `${bufPct}%`;
        }
    }

    function showOSD(permanent = false) {
        elements.osdOverlay.classList.remove('hidden');
        state.osdVisible = true;

        if (state.osdTimeout) clearTimeout(state.osdTimeout);

        if (!permanent && state.isPlaying) {
            state.osdTimeout = setTimeout(() => {
                if (!state.activeMenu && state.isPlaying) {
                    elements.osdOverlay.classList.add('hidden');
                    state.osdVisible = false;
                }
            }, 4000);
        }
    }

    function toggleMenu(menuId) {
        if (state.activeMenu === menuId) {
            closeMenus();
        } else {
            closeMenus();
            state.activeMenu = menuId;
            const menuEl = document.getElementById(menuId);
            menuEl.classList.remove('hidden');

            const firstFocusable = menuEl.querySelector('.focusable');
            if (firstFocusable) setFocus(firstFocusable);
        }
    }

    function closeMenus() {
        ['speed-menu', 'quality-menu', 'audio-menu', 'subtitle-menu'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        state.activeMenu = null;
    }

    // =========================================================================
    // HISTORY MANAGER
    // =========================================================================
    function saveToHistory(url) {
        state.history = state.history.filter(item => item.url !== url);
        state.history.unshift({
            url: url,
            title: getFileNameFromUrl(url),
            timestamp: Date.now()
        });
        if (state.history.length > 20) state.history.pop();
        localStorage.setItem('vidaa_player_history', JSON.stringify(state.history));
    }

    function renderHistory() {
        elements.historyList.innerHTML = '';
        if (state.history.length === 0) {
            elements.historyList.innerHTML = '<div class="empty-history">История пуста. Введенные ссылки будут сохраняться здесь.</div>';
            return;
        }

        state.history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item focusable';
            div.tabIndex = 0;

            const pos = state.savedPositions[item.url];
            const posText = pos ? ` • Нажмите для продолжения с ${formatTime(pos)}` : '';

            div.innerHTML = `
                <div class="history-info">
                    <div class="history-url">${escapeHtml(item.url)}</div>
                    <div class="history-meta">${new Date(item.timestamp).toLocaleDateString()}${posText}</div>
                </div>
                <button class="btn btn-secondary focusable btn-play-hist">Смотреть</button>
            `;

            div.addEventListener('click', () => {
                elements.urlInput.value = item.url;
                loadVideo(item.url);
            });

            elements.historyList.appendChild(div);
        });
    }

    function clearHistory() {
        state.history = [];
        state.savedPositions = {};
        localStorage.removeItem('vidaa_player_history');
        localStorage.removeItem('vidaa_player_positions');
        renderHistory();
    }

    // =========================================================================
    // UTILITY FUNCTIONS & TOAST
    // =========================================================================
    function switchScreen(screenId) {
        state.currentScreen = screenId;
        elements.startScreen.classList.toggle('active', screenId === 'start-screen');
        elements.playerScreen.classList.toggle('active', screenId === 'player-screen');
    }

    function showToast(message) {
        if (state.toastTimeout) {
            clearTimeout(state.toastTimeout);
        }
        elements.toast.textContent = message;
        elements.toast.classList.remove('hidden');
        state.toastTimeout = setTimeout(() => {
            elements.toast.classList.add('hidden');
            state.toastTimeout = null;
        }, 2500);
    }

    function showError(msg) {
        elements.errorMessage.textContent = msg;
        elements.playerLoader.classList.add('hidden');
        elements.playerError.classList.remove('hidden');
        setFocus(elements.btnErrorBack);
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;

        if (hrs > 0) {
            return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
        }
        return `${remMins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function getFileNameFromUrl(url) {
        try {
            const parsed = new URL(url);
            const pathname = parsed.pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            return filename || parsed.hostname;
        } catch (e) {
            return url;
        }
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    // Run Initializer
    init();
});
