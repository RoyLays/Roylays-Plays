import { LibMedia } from "../libmedia/libmedia.js";
import { LibMidi, createUnlockingAudioContext } from "../libmidi/libmidi.js";
import { codeMap, getCodeMap, KeyRepeatManager } from "./key.js";
import { EventQueue } from "./eventqueue.js";
import { initKbdListeners, setKbdHandler, kbdWidth, kbdHeight } from "./screenKbd.js";
import { startGamepadPolling, stopGamepadPolling, setupGamepadListeners, isGamepadConnected } from "./gamepad.js";
import { requestPersistentStorage, putExitBackup } from "./saveBackup.js";

// we need to import natives here, don't use System.loadLibrary
// since CheerpJ fails to load them in firefox and we can't set breakpoints
import canvasFontNatives from "../libjs/libcanvasfont.js";
import canvasGraphicsNatives from "../libjs/libcanvasgraphics.js";
import gles2Natives from "../libjs/libgles2.js";
import jsReferenceNatives from "../libjs/libjsreference.js";
import mediaBridgeNatives from "../libjs/libmediabridge.js";
import midiBridgeNatives from "../libjs/libmidibridge.js";

const evtQueue = new EventQueue();
const sp = new URLSearchParams(location.search);

const cheerpjWebRoot = '/app'+location.pathname.replace(/\/[^/]*$/,'');

let isMobile = sp.get('mobile');

// Read control scheme from localStorage or auto-detect
let controlScheme = sp.get('scheme') || localStorage.getItem('roylays_control_scheme');
if (!controlScheme) {
    const hasGamepad = navigator.getGamepads && navigator.getGamepads().some(p => p);
    controlScheme = hasGamepad ? 'pro' : 'modern';
}

// Persist the chosen scheme (unless it came from a URL param)
if (!sp.get('scheme')) {
    localStorage.setItem('roylays_control_scheme', controlScheme);
}
const activeCodeMap = getCodeMap(controlScheme);

let display = null;
let screenCtx = null;

let fractionScale = sp.get('fractionScale') || (localStorage && localStorage.getItem("pl.zb3.freej2me.fractionScale") === "true");
let scaleSet = false;

const keyRepeatManager = new KeyRepeatManager();

window.evtQueue = evtQueue;

function autoscale() {
    if (!scaleSet) return;

    let screenWidth = window.innerWidth;
    let screenHeight = window.innerHeight;

    // === Portrait mode: keypad driven by CSS media query ===
    const portraitKbd = document.getElementById('portrait-keypad');
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;

    if (isPortrait && portraitKbd) {
        // Measure actual rendered height of the portrait keypad
        const kbdH = portraitKbd.getBoundingClientRect().height || 260;
        // Sync CSS variable so #screen-area bottom offset matches exactly
        document.documentElement.style.setProperty('--portrait-kbd-height', kbdH + 'px');
        screenHeight = screenHeight - kbdH;
        // Remove landscape classes
        document.body.classList.remove('kbd-portrait', 'kbd-landscape');
    } else if (isMobile) {
        // Legacy landscape split-panel mode (URL param ?mobile)
        if (screenWidth > screenHeight) {
            document.body.classList.add('kbd-landscape');
            document.body.classList.remove('kbd-portrait');
            screenWidth = screenWidth - 2 * kbdWidth;
        } else {
            document.body.classList.add('kbd-portrait');
            document.body.classList.remove('kbd-landscape');
            screenHeight = screenHeight - kbdHeight;
        }

        document.getElementById('left-keys').style.display = '';
        document.getElementById('right-keys').style.display = '';
    }

    let scale = Math.min(
        screenWidth / screenCtx.canvas.width,
        screenHeight / screenCtx.canvas.height
    );

    if (!fractionScale) {
        scale = scale | 0;
    }

    display.style.zoom = scale;
}

function updateSchemeIndicator() {
    const badge = document.getElementById('scheme-indicator');
    if (!badge) return;

    const labels = {
        classical: '🎹 Classical',
        modern: '🖱️ Modern',
        pro: '🎮 Pro',
    };
    badge.textContent = labels[controlScheme] || labels.classical;

    // Also update controller status badge if in Pro mode
    const statusEl = document.getElementById('controller-status');
    if (statusEl) {
        if (controlScheme === 'pro') {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            let connected = false;
            for (const gp of gamepads) {
                if (gp) {
                    statusEl.classList.add('visible');
                    statusEl.textContent = '🎮 ' + (gp.id.split('(')[0].trim() || 'Controller Connected');
                    connected = true;
                    break;
                }
            }
            if (!connected) {
                statusEl.classList.add('visible');
                statusEl.textContent = '🎮 Press any button on controller';
            }
        } else {
            statusEl.classList.remove('visible');
        }
    }
}

function setupFullscreenButton() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (!fullscreenBtn) return;

    const arcadeFrame = document.getElementById('arcade-frame');

    const syncFullscreenUi = () => {
        const inFullscreen = !!document.fullscreenElement;
        fullscreenBtn.textContent = inFullscreen ? '🡼' : '⛶';
        fullscreenBtn.title = inFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
        fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title);

        // Toggle arcade cabinet frame
        if (arcadeFrame) {
            if (inFullscreen) {
                arcadeFrame.classList.add('active');
            } else {
                arcadeFrame.classList.remove('active');
            }
        }
    };

    fullscreenBtn.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen toggle failed:', err);
        } finally {
            syncFullscreenUi();
        }
    });

    document.addEventListener('fullscreenchange', syncFullscreenUi);
    syncFullscreenUi();
}

function setListeners() {
    let mouseDown = false;
    let noMouse = false;
    const heldKeyboardKeys = new Set();
    let modernClickHeld = false;

    // Background Music Pin System
    const setupPinnedMusic = () => {
        const isPinned = localStorage.getItem('music_pinned') === 'true';
        
        // Always load the playlist so we can control it via the sidebar even if not pinned
        const playlist = [
            { src: 'assets/bg_music.mp3', title: 'Shounen ki', artist: 'negimaavni', bg: 'url("assets/music_bg.jpg")' },
            { src: 'assets/music_2.mp3', title: 'Sabse Phele Hein Payar', artist: 'eunica.smusic', bg: 'url("assets/music_2_cover.jpg")' },
            { src: 'assets/music_3.mp3', title: 'नीली चिड़िया', artist: 'WeWake', bg: 'url("assets/music_3_bg.jpg")' },
            { src: 'assets/music_4.mp3', title: "Bink's Sake", artist: 'Rawmats', bg: 'url("assets/music_4_bg.jpg")' },
            { src: 'assets/music_5.mp3', title: 'Pokemon Season 1', artist: 'Official', bg: 'url("assets/music_5_bg.jpg")' },
            { src: 'assets/music_6.mp3', title: 'BestOfLuckNikki', artist: 'Ananya Kolvankar', bg: 'url("assets/music_6_bg.jpg")' }
        ];

        const savedState = JSON.parse(localStorage.getItem('music_state') || '{}');
        let currentSongIndex = savedState.currentSongIndex || 0;
        let isPlaying = isPinned ? (savedState.isPlaying || false) : false;

        const audio = new Audio(playlist[currentSongIndex].src);
        audio.volume = 0.3; // 30% Volume for pinned background music
        audio.currentTime = isPinned ? (savedState.currentTime || 0) : 0;

        const sidebar = document.getElementById('music-sidebar');
        if (isPinned && sidebar) sidebar.classList.add('visible');

        const musicTitle = document.getElementById('music-title');
        const musicArtist = document.querySelector('.music-artist');
        const musicBox = document.querySelector('.sidebar-music-player');
        const progressPath = document.querySelector('.music-progress-path');
        const playPauseBtn = document.getElementById('music-play-pause');

        const loadSong = (index, shouldPlay = true) => {
            const song = playlist[index];
            // Only update src if it's different to avoid resetting currentTime on initial load
            if (!audio.src.endsWith(song.src)) {
                audio.src = song.src;
            }
            musicTitle.textContent = song.title;
            musicArtist.textContent = song.artist;
            musicBox.style.setProperty('--music-bg', song.bg);
            if (shouldPlay) {
                audio.play().catch(() => {});
                isPlaying = true;
            } else {
                audio.pause();
                isPlaying = false;
            }
            updatePlayBtn();
        };

        const updatePlayBtn = () => {
            playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            // Save state to localStorage for persistence
            if (isPinned) {
                localStorage.setItem('music_state', JSON.stringify({
                    currentSongIndex,
                    isPlaying,
                    currentTime: audio.currentTime
                }));
            }
        };

        // Sync initial state
        loadSong(currentSongIndex, isPlaying);

        playPauseBtn.onclick = () => {
            if (isPlaying) audio.pause();
            else audio.play().catch(() => {});
            isPlaying = !isPlaying;
            updatePlayBtn();
        };

        document.getElementById('music-next').onclick = () => {
            currentSongIndex = (currentSongIndex + 1) % playlist.length;
            loadSong(currentSongIndex);
        };

        document.getElementById('music-prev').onclick = () => {
            currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
            loadSong(currentSongIndex);
        };

        audio.onended = () => {
            currentSongIndex = (currentSongIndex + 1) % playlist.length;
            loadSong(currentSongIndex);
        };

        // Progress ring logic
        const updateProgress = () => {
            if (progressPath && audio.duration) {
                const width = musicBox.offsetWidth;
                const height = musicBox.offsetHeight;
                if (width > 0) {
                    const r = 24, inset = 2.5;
                    const w = width - 2 * inset, h = height - 2 * inset, cx = w / 2;
                    const d = `M ${cx+inset},${inset} L ${w-r+inset},${inset} A ${r},${r} 0 0 1 ${w+inset},${r+inset} L ${w+inset},${h-r+inset} A ${r},${r} 0 0 1 ${w-r+inset},${h+inset} L ${r+inset},${h+inset} A ${r},${r} 0 0 1 ${inset},${h-r+inset} L ${inset},${r+inset} A ${r},${r} 0 0 1 ${r+inset},${inset} L ${cx+inset},${inset} Z`;
                    progressPath.setAttribute('d', d);
                    const length = progressPath.getTotalLength();
                    progressPath.style.strokeDasharray = length;
                    progressPath.style.strokeDashoffset = length * (1 - (audio.currentTime / audio.duration));
                }
            }
            requestAnimationFrame(updateProgress);
        };
        updateProgress();

        // Audio Balance Helper: Lower volume when game is loading/playing
        const handleAudioBalance = () => {
            if (isPinned) {
                audio.volume = 0.3; // Keep it at 30% when pinned
            }
        };
        window.addEventListener('mousedown', handleAudioBalance, { once: true });
    };
    setupPinnedMusic();

    setKbdHandler((isDown, key) => {
        const symbol = key.startsWith('Digit') ? key.substring(5) : '\x00';
        keyRepeatManager.post(isDown, key, {symbol, ctrlKey: false, shiftKey: false});
    });

    function releaseAllHeldKeys() {
        for (const code of heldKeyboardKeys) {
            keyRepeatManager.post(false, code, { symbol: '\x00', ctrlKey: false, shiftKey: false });
        }
        heldKeyboardKeys.clear();

        if (modernClickHeld) {
            evtQueue.queueEvent({ kind: 'keyup', args: [13, '\x00', false, false] });
            modernClickHeld = false;
        }
    }

    function handleKeyEvent(e) {
        const isDown = e.type === 'keydown';

        if (activeCodeMap[e.code]) {
            if (isDown) {
                heldKeyboardKeys.add(e.code);
            } else {
                heldKeyboardKeys.delete(e.code);
            }
            keyRepeatManager.post(isDown, e.code, {
                symbol: e.key.length == 1 ? e.key.charCodeAt(0) : '\x00',
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey
            })
        }
        e.preventDefault();
    }

    display.addEventListener('keydown', handleKeyEvent);
    display.addEventListener('keyup', handleKeyEvent);

    keyRepeatManager.register((kind, key, args) => {
        if (kind === 'click') {
            if (key === 'Maximize') {
                fractionScale = !fractionScale;
                localStorage && localStorage.setItem("pl.zb3.freej2me.fractionScale", fractionScale);
                autoscale();
            }
        } else if (activeCodeMap[key]) {
            evtQueue.queueEvent({
                kind: kind === 'up' ? 'keyup' : 'keydown',
                args: [activeCodeMap[key], args.symbol, args.ctrlKey, args.shiftKey]
            });
        }
    });

    // === Modern scheme: Left-click = Enter/OK (same path as old right-click; no key-repeat) ===
    if (controlScheme === 'modern') {
        display.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        function modernEnterDown() {
            evtQueue.queueEvent({ kind: 'keydown', args: [13, '\x00', false, false] });
            modernClickHeld = true;
        }

        function modernEnterUp() {
            if (!modernClickHeld) return;
            evtQueue.queueEvent({ kind: 'keyup', args: [13, '\x00', false, false] });
            modernClickHeld = false;
        }

        display.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                modernEnterDown();
                e.preventDefault();
            }
        });

        display.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                modernEnterUp();
                e.preventDefault();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                modernEnterUp();
            }
        });
    }

    // === Standard pointer handling (left-click / touch) ===
    display.addEventListener('mousedown', async e => {
        if (e.button !== 0) return; // Only handle left-click for pointer
        if (controlScheme === 'modern') return; // Modern uses left click for OK, not pointer
        display.focus();
        if (noMouse) return;

        evtQueue.queueEvent({
            kind: 'pointerpressed',
            x: e.offsetX / display.currentCSSZoom | 0,
            y: e.offsetY / display.currentCSSZoom | 0,
        });

        mouseDown = true;

        e.preventDefault();
    });

    display.addEventListener('mousemove', async e => {
        if (noMouse) return;
        if (!mouseDown) return;

        evtQueue.queueEvent({
            kind: 'pointerdragged',
            x: e.offsetX / display.currentCSSZoom | 0,
            y: e.offsetY / display.currentCSSZoom | 0,
        });

        e.preventDefault();
    });

    document.addEventListener('mouseup', async e => {
        if (e.button !== 0) return;
        if (noMouse) return;
        if (!mouseDown) return;

        mouseDown = false;

        evtQueue.queueEvent({
            kind: 'pointerreleased',
            x: (e.pageX - display.offsetLeft) / display.currentCSSZoom | 0,
            y: (e.pageY - display.offsetTop) / display.currentCSSZoom | 0,
        });

        e.preventDefault();
    });


    display.addEventListener('touchstart', async e => {
        display.focus();
        noMouse = true;

        evtQueue.queueEvent({
            kind: 'pointerpressed',
            x: (e.changedTouches[0].pageX - display.offsetLeft) / display.currentCSSZoom | 0,
            y: (e.changedTouches[0].pageY - display.offsetTop) / display.currentCSSZoom | 0,
        });

        e.preventDefault();
    }, {passive: false});

    display.addEventListener('touchmove', async e => {
        noMouse = true;

        evtQueue.queueEvent({
            kind: 'pointerdragged',
            x: (e.changedTouches[0].pageX - display.offsetLeft) / display.currentCSSZoom | 0,
            y: (e.changedTouches[0].pageY - display.offsetTop) / display.currentCSSZoom | 0,
        });

        e.preventDefault();
    }, {passive: false});

    display.addEventListener('touchend', async e => {
        noMouse = true;

        evtQueue.queueEvent({
            kind: 'pointerreleased',
            x: (e.changedTouches[0].pageX - display.offsetLeft) / display.currentCSSZoom | 0,
            y: (e.changedTouches[0].pageY - display.offsetTop) / display.currentCSSZoom | 0,
        });

        e.preventDefault();
    });

    document.addEventListener('mousedown', e => {
        setTimeout(() => display.focus(), 20);
    });

    display.addEventListener('blur', e => {
        releaseAllHeldKeys();
        // it doesn't work without any timeout
        setTimeout(() => display.focus(), 10);
    });
    window.addEventListener('blur', releaseAllHeldKeys);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            releaseAllHeldKeys();
        }
    });

    window.addEventListener('resize', autoscale);
    window.addEventListener('orientationchange', () => {
        // Re-run autoscale after orientation stabilises
        setTimeout(autoscale, 150);
    });

    initKbdListeners();

    // === Pro scheme: Gamepad support ===
    if (controlScheme === 'pro') {
        setupGamepadListeners(() => {
            updateSchemeIndicator();
        });

        // Start gamepad polling — events go directly into the event queue
        startGamepadPolling((type, keycode, args) => {
            evtQueue.queueEvent({
                kind: type === 'down' ? 'keydown' : 'keyup',
                args: [keycode, args.symbol, args.ctrlKey, args.shiftKey]
            });
        });
    }
}

function setFaviconFromBuffer(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: 'image/png' });

    const reader = new FileReader();
    reader.onload = function() {
        const dataURL = reader.result;

        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'icon');
            document.head.appendChild(link);
        }
        link.setAttribute('href', dataURL);
    };
    reader.readAsDataURL(blob);
}

let exitBackupRunning = false;
let lastBackgroundFlush = 0;

async function flushExitBackup(lib) {
    if (!lib || exitBackupRunning) return;
    exitBackupRunning = true;
    try {
        const LauncherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;
        const exportedData = await LauncherUtil.exportData();
        let ab;
        if (exportedData && exportedData.buffer) {
            ab = exportedData.buffer.slice(
                exportedData.byteOffset,
                exportedData.byteOffset + exportedData.byteLength
            );
        } else {
            ab = new Uint8Array(exportedData).buffer;
        }
        await putExitBackup(ab);
    } catch (e) {
        console.warn("[Roylays] save flush failed", e);
    } finally {
        exitBackupRunning = false;
    }
}

async function ensureAppInstalled(lib, appId) {
    const appFile = await cjFileBlob(appId + "/app.jar");

    if (!appFile) {
        const launcherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;

        await launcherUtil.installFromBundle(cheerpjWebRoot + "/apps/", appId);
    }
}

async function init() {
    document.getElementById("loading-status").textContent = "Preparing engine...";

    display = document.getElementById('display');
    screenCtx = display.getContext('2d');

    updateSchemeIndicator();
    setupFullscreenButton();
    setListeners();

    // Auto-fullscreen logic: attempt on first interaction or as soon as possible
    const unlockAudioAndFullscreen = async () => {
        try {
            // Unlock Java audio
            if (window.libmidi && window.libmidi.unlock) {
                await window.libmidi.unlock();
            } else {
                createUnlockingAudioContext();
            }

            // Enter fullscreen
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch (err) {
            // Ignore errors
        }
    };
    document.addEventListener('mousedown', unlockAudioAndFullscreen, { once: true });
    document.addEventListener('keydown', unlockAudioAndFullscreen, { once: true });
    document.addEventListener('touchstart', unlockAudioAndFullscreen, { once: true });

    window.libmidi = new LibMidi(createUnlockingAudioContext());
    await window.libmidi.init();
    window.libmidi.midiPlayer.addEventListener('end-of-media', e => {
        window.evtQueue.queueEvent({kind: 'player-eom', player: e.target});
    })
    window.libmedia = new LibMedia();

    await cheerpjInit({
        enableDebug: false,
        natives: {
            ...canvasFontNatives,
            ...canvasGraphicsNatives,
            ...gles2Natives,
            ...jsReferenceNatives,
            ...mediaBridgeNatives,
            ...midiBridgeNatives,
            async Java_pl_zb3_freej2me_bridge_shell_Shell_setTitle(lib, title) {
                document.title = title;
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_setIcon(lib, iconBytes) {
                if (iconBytes) {
                    setFaviconFromBuffer(iconBytes.buffer);
                }
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_getScreenCtx(lib) {
                return screenCtx;
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_setCanvasSize(lib, width, height) {
                if (!scaleSet) {
                    document.getElementById('loading').style.display = 'none';
                    display.style.display = '';
                    scaleSet = true;
                    display.focus();
                }
                screenCtx.canvas.width = width;
                screenCtx.canvas.height = height;
                autoscale();
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_waitForAndDispatchEvents(lib, listener) {
                const KeyEvent = await lib.pl.zb3.freej2me.bridge.shell.KeyEvent;
                const PointerEvent = await lib.pl.zb3.freej2me.bridge.shell.PointerEvent;

                const evt = await evtQueue.waitForEvent();
                if (evt.kind == 'keydown') {
                    await listener.keyPressed(await new KeyEvent(...evt.args));
                } else if (evt.kind == 'keyup') {
                    await listener.keyReleased(await new KeyEvent(...evt.args));
                } else if (evt.kind == 'pointerpressed') {
                    await listener.pointerPressed(await new PointerEvent(evt.x, evt.y));
                } else if (evt.kind == 'pointerdragged') {
                    await listener.pointerDragged(await new PointerEvent(evt.x, evt.y));
                } else if (evt.kind == 'pointerreleased') {
                    await listener.pointerReleased(await new PointerEvent(evt.x, evt.y));
                } else if (evt.kind == 'player-eom') {
                    await listener.playerEOM(evt.player);
                } else if (evt.kind == 'player-video-frame') {
                    await listener.playerVideoFrame(evt.player);
                }
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_restart(lib) {
                location.reload();
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_exit(lib) {
                await flushExitBackup(lib);
                location.href = './';
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_sthop(lib) {
                debugger;
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_say(lib, sth) {
                console.log('[say]', sth);
            },
            async Java_pl_zb3_freej2me_bridge_shell_Shell_sayObject(lib, label, obj) {
                debugger;
                console.log('[sayobject]', label, obj);
            }
        }
    });

    await requestPersistentStorage();

    document.getElementById("loading-status").textContent = "Starting game...";

    const lib = await cheerpjRunLibrary(cheerpjWebRoot+"/freej2me-web.jar");

    const homeLink = document.querySelector(".brand-overlay");
    if (homeLink) {
        homeLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await flushExitBackup(lib);
            location.href = "./";
        });
    }

    window.addEventListener("pagehide", () => {
        flushExitBackup(lib).catch(() => {});
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) return;
        const now = Date.now();
        if (now - lastBackgroundFlush < 30000) return;
        lastBackgroundFlush = now;
        flushExitBackup(lib).catch(() => {});
    });

    const FreeJ2ME = await lib.org.recompile.freej2me.FreeJ2ME;

    let args;

    if (sp.get('app')) {
        const app = sp.get('app');
        await ensureAppInstalled(lib, app);

        args = ['app', sp.get('app')];
    } else {
        args = ['jar', cheerpjWebRoot+"/jar/" + (sp.get('jar') || "game.jar")];
    }

    FreeJ2ME.main(args).catch(e => {
        e.printStackTrace();
        document.getElementById('loading-status').textContent = 'Crash :(';
        document.getElementById('loading').style.display = '';
    });


}

init();