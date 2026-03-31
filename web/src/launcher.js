// note that we can only call java stuff if thread not running..
import { requestPersistentStorage } from "./saveBackup.js";

const cheerpjWebRoot = '/app'+location.pathname.replace(/\/$/,'');

const emptyIcon = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const ACCESS_PIN = "123Roy45";

let lib = null, launcherUtil = null;
let state = {
    games: [],
    currentGame: null,
    editedGameId: null,
    uploadedJars: 0,
};
let defaultSettings = {};
let activeTab = 'all'; // 'all' or 'favorites'

function requestPin() {
    return new Promise((resolve) => {
        const modal = document.getElementById('pin-modal');
        const input = document.getElementById('pin-input');
        const confirmBtn = document.getElementById('pin-confirm-btn');
        const cancelBtn = document.getElementById('pin-cancel-btn');
        const errorMsg = document.getElementById('pin-error-msg');

        input.value = '';
        errorMsg.classList.remove('visible');
        modal.classList.add('active');
        input.focus();

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            input.onkeydown = null;
        };

        const handleConfirm = () => {
            if (input.value === ACCESS_PIN) {
                cleanup();
                resolve(true);
            } else {
                errorMsg.classList.add('visible');
                input.value = '';
                input.focus();
            }
        };

        confirmBtn.onclick = handleConfirm;
        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            }
        };
    });
}

function getAverageColor(imageSrc) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageSrc;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i+1];
                b += data[i+2];
            }
            const count = data.length / 4;
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);
            resolve(`rgb(${r}, ${g}, ${b})`);
        };
        img.onerror = () => resolve('rgb(255, 0, 0)'); // Fallback to red
    });
}

async function setupBackgroundMusic() {
    const playlist = [
        {
            src: 'assets/bg_music.mp3',
            title: 'Shounen ki',
            artist: 'negimaavni',
            bg: 'url("assets/music_bg.jpg")'
        },
        {
            src: 'assets/music_2.mp3',
            title: 'Sabse Phele Hein Payar',
            artist: 'eunica.smusic',
            bg: 'url("assets/music_2_cover.jpg")'
        },
        {
            src: 'assets/music_3.mp3',
            title: 'नीली चिड़िया',
            artist: 'WeWake',
            bg: 'url("assets/music_3_bg.jpg")'
        },
        {
            src: 'assets/music_4.mp3',
            title: "Bink's Sake",
            artist: 'Rawmats',
            bg: 'url("assets/music_4_bg.jpg")'
        },
        {
            src: 'assets/music_5.mp3',
            title: 'Pokemon Season 1',
            artist: 'Official',
            bg: 'url("assets/music_5_bg.jpg")'
        },
        {
            src: 'assets/music_6.mp3',
            title: 'BestOfLuckNikki',
            artist: 'Ananya Kolvankar',
            bg: 'url("assets/music_6_bg.jpg")'
        }
    ];

    let currentSongIndex = 0;
    const audio = new Audio(playlist[currentSongIndex].src);
    audio.loop = false; // Disable loop to handle playlist progression
    
    const playPauseBtn = document.getElementById('music-play-pause');
    const nextBtn = document.getElementById('music-next');
    const prevBtn = document.getElementById('music-prev');
    const musicTitle = document.getElementById('music-title');
    const musicArtist = document.querySelector('.music-artist');
    const musicBox = document.querySelector('.sidebar-music-player');
    const progressPath = document.querySelector('.music-progress-path');
    let isPlaying = false;

    const loadSong = (index) => {
        const song = playlist[index];
        audio.src = song.src;
        musicTitle.textContent = song.title;
        musicArtist.textContent = song.artist;
        
        // Sync mobile widget
        const mTitle = document.getElementById('mobile-music-title');
        const mArtist = document.getElementById('mobile-music-artist');
        const mCover = document.getElementById('mobile-music-cover');
        const mWidget = document.querySelector('.mobile-music-widget');

        if (mTitle) mTitle.textContent = song.title;
        if (mArtist) mArtist.textContent = song.artist;
        if (mCover) {
            mCover.style.backgroundImage = song.bg;
            mCover.style.backgroundSize = 'cover';
            mCover.style.backgroundPosition = 'center';
        }
        if (mWidget) {
            mWidget.style.setProperty('--music-bg', song.bg);
        }

        musicBox.style.setProperty('--music-bg', song.bg);
        if (isPlaying) {
            audio.play().catch(err => console.log("Playback error:", err));
        }
    };

    nextBtn.onclick = (e) => {
        e.stopPropagation();
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        loadSong(currentSongIndex);
    };

    prevBtn.onclick = (e) => {
        e.stopPropagation();
        currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
        loadSong(currentSongIndex);
    };

    audio.onended = () => {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        loadSong(currentSongIndex);
    };

    const pinBtn = document.getElementById('music-pin');
    let isPinned = localStorage.getItem('music_pinned') === 'true';

    if (isPinned) {
        pinBtn.classList.add('active');
    }

    pinBtn.onclick = (e) => {
        e.stopPropagation();
        isPinned = !isPinned;
        localStorage.setItem('music_pinned', isPinned);
        pinBtn.classList.toggle('active', isPinned);
        
        if (isPinned) {
            // Save current state to share with game tab
            const musicState = {
                currentSongIndex,
                currentTime: audio.currentTime,
                isPlaying
            };
            localStorage.setItem('music_state', JSON.stringify(musicState));
        }
    };

    // Periodically save state if pinned
    setInterval(() => {
        if (isPinned) {
            const musicState = {
                currentSongIndex,
                currentTime: audio.currentTime,
                isPlaying
            };
            localStorage.setItem('music_state', JSON.stringify(musicState));
        }
    }, 1000);

    // Calculate average color and set stroke (DISABLED for red border request)
    // getAverageColor('assets/music_bg.jpg').then(avgColor => {
        const progressPaths = document.querySelectorAll('.music-progress-path');
        
        const updateDashArray = () => {
            const lengths = [];
            progressPaths.forEach(path => {
                const container = path.closest('.sidebar-music-player');
                if (!container || container.offsetWidth === 0) {
                    lengths.push(0);
                    return;
                }
                
                const width = container.offsetWidth;
                const height = container.offsetHeight;
                const r = 24;
                const inset = 2.5; // Stroke-width / 2
                
                const w = width - 2 * inset;
                const h = height - 2 * inset;
                const cx = w / 2;
                
                // Rounded rect path starting from top-center
                const d = `M ${cx + inset},${inset} 
                           L ${w - r + inset},${inset} 
                           A ${r},${r} 0 0 1 ${w + inset},${r + inset} 
                           L ${w + inset},${h - r + inset} 
                           A ${r},${r} 0 0 1 ${w - r + inset},${h + inset} 
                           L ${r + inset},${h + inset} 
                           A ${r},${r} 0 0 1 ${inset},${h - r + inset} 
                           L ${inset},${r + inset} 
                           A ${r},${r} 0 0 1 ${r + inset},${inset} 
                           L ${cx + inset},${inset} Z`;
                
                path.setAttribute('d', d);
                const preciseLength = path.getTotalLength();
                
                path.style.stroke = '#ff0000'; // Set to red
                path.style.filter = 'drop-shadow(0 0 5px rgba(255, 0, 0, 0.5))'; // Red glow
                path.style.strokeDasharray = preciseLength;
                lengths.push(preciseLength);
            });
            return lengths;
        };

        let totalLengths = updateDashArray();
        
        // Observer to update when container becomes visible
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                totalLengths = updateDashArray();
            }
        });
        
        document.querySelectorAll('.sidebar-music-player').forEach(container => {
            observer.observe(container);
        });

        window.addEventListener('resize', () => {
            totalLengths = updateDashArray();
        });

        audio.onloadedmetadata = () => {
            totalLengths = updateDashArray();
        };

        audio.ontimeupdate = () => {
            if (!totalLengths || totalLengths.some(l => l === 0)) totalLengths = updateDashArray();
            if (isNaN(audio.duration) || audio.duration === 0 || !totalLengths) return;
            const progress = audio.currentTime / audio.duration;
            
            progressPaths.forEach((path, i) => {
                const len = totalLengths[i];
                if (len) {
                    path.style.strokeDashoffset = len * (1 - progress);
                }
            });
        };
    // });

    const updatePlayPauseBtn = () => {
        playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        const mobilePlayBtn = document.getElementById('mobile-music-play-pause');
        if (mobilePlayBtn) {
            mobilePlayBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        }
    };

    const mobilePlayBtn = document.getElementById('mobile-music-play-pause');
    const mobileNextBtn = document.getElementById('mobile-music-next');
    const mobilePrevBtn = document.getElementById('mobile-music-prev');

    if (mobilePlayBtn) {
        mobilePlayBtn.onclick = (e) => {
            e.stopPropagation();
            playPauseBtn.click();
        };
    }

    if (mobileNextBtn) {
        mobileNextBtn.onclick = (e) => {
            e.stopPropagation();
            nextBtn.click();
        };
    }

    if (mobilePrevBtn) {
        mobilePrevBtn.onclick = (e) => {
            e.stopPropagation();
            prevBtn.click();
        };
    }

    playPauseBtn.onclick = (e) => {
        e.stopPropagation(); // Don't trigger the document-level autoplay
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(err => console.log("Autoplay blocked, waiting for interaction", err));
        }
        isPlaying = !isPlaying;
        updatePlayPauseBtn();
    };

    // Browsers block autoplay until the first user interaction.
    // We listen for the first click anywhere on the page to start playing by default.
    const startAutoplay = () => {
        if (!isPlaying) {
            audio.play().then(() => {
                isPlaying = true;
                updatePlayPauseBtn();
            }).catch(() => {});
        }
    };

    document.addEventListener('click', startAutoplay, { once: true });

    // Initialize UI with the first song
    loadSong(currentSongIndex);
}

async function handleFullscreenRecommendation() {
    const modal = document.getElementById('fs-recommendation-modal');
    const greetingEl = document.getElementById('fs-greeting');
    const yesBtn = document.getElementById('fs-btn-yes');
    const noBtn = document.getElementById('fs-btn-no');
    
    if (!modal || !greetingEl || !yesBtn || !noBtn) return;

    // Set greeting based on time
    const hour = new Date().getHours();
    let greeting = "Good Morning";
    if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17 && hour < 21) greeting = "Good Evening";
    else if (hour >= 21 || hour < 5) greeting = "Good Night";
    
    greetingEl.textContent = `${greeting} - from team Roylays`;

    // Show modal
    modal.classList.add('active');

    const closeFSModal = () => {
        modal.classList.remove('active');
    };

    yesBtn.onclick = () => {
        const docEl = document.documentElement;
        const requestFullscreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        if (requestFullscreen) {
            requestFullscreen.call(docEl).catch(err => {
                console.log("Fullscreen request failed:", err);
            });
        }
        closeFSModal();
    };

    noBtn.onclick = () => {
        closeFSModal();
    };
}

async function main() {
    setupBackgroundMusic();
    document.getElementById("loading-status").textContent = "Preparing engine...";
    await cheerpjInit({
        enableDebug: false
    });

    await requestPersistentStorage();

    lib = await cheerpjRunLibrary(cheerpjWebRoot+"/freej2me-web.jar");

    document.getElementById("loading-status").textContent = "Loading games...";

    launcherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;

    await launcherUtil.resetTmpDir();

    const Config = await lib.org.recompile.freej2me.Config;
    await javaToKv(Config.DEFAULT_SETTINGS, defaultSettings);

    await reloadUI();

    document.getElementById("loading").style.display = "none";
    document.getElementById("main").style.display = "";

    // Trigger fullscreen recommendation dialog
    handleFullscreenRecommendation();

    document.getElementById("clear-current").onclick = setupAddMode;

    document.getElementById("import-data-btn").addEventListener("click", () => {
        document.getElementById("import-data-file").click();
    });

    document.getElementById("import-data-file").onchange = doImportData;
    document.getElementById("export-data-btn").onclick = doExportData;

    // Sidebar Navigation
    document.getElementById('nav-home').addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        activeTab = 'all';
        updateSidebarActive('nav-home');
        fillGamesList(state.games, false);
    });

    document.getElementById('nav-games').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.section-title').scrollIntoView({ behavior: 'smooth' });
        activeTab = 'all';
        updateSidebarActive('nav-games');
        fillGamesList(state.games, false);
    });

    document.getElementById('nav-favorites').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.section-title').scrollIntoView({ behavior: 'smooth' });
        activeTab = 'favorites';
        updateSidebarActive('nav-favorites');
        fillGamesList(state.games, true);
    });

    // Mobile Navigation
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.mobileTab;
            document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch view based on tab
            document.body.classList.remove('mobile-mode-home', 'mobile-mode-games', 'mobile-mode-controls', 'mobile-mode-about');
            document.body.classList.add(`mobile-mode-${tab}`);

            if (tab === 'home') {
                document.body.classList.add('mobile-mode-home');
                fillMobileGrid(state.games);
            } else if (tab === 'games') {
                // Similar to "My Games" desktop section
                document.querySelector('.section-title').scrollIntoView({ behavior: 'smooth' });
            } else if (tab === 'controls') {
                // In mobile mode, controls are shown inline via CSS class
                if (window.innerWidth > 768) {
                    document.getElementById('controls-modal').classList.add('active');
                } else {
                    // Ensure we scroll to top when switching to inline view
                    document.querySelector('.content-area').scrollTop = 0;
                }
            } else if (tab === 'about') {
                // In mobile mode, about is shown inline via CSS class
                if (window.innerWidth > 768) {
                    document.getElementById('about-modal').classList.add('active');
                } else {
                    // Ensure we scroll to top when switching to inline view
                    document.querySelector('.content-area').scrollTop = 0;
                }
            }
        };
    });

    // Mobile Controls Quick Action
    const mobileControlsBtn = document.getElementById('mobile-controls-btn');
    if (mobileControlsBtn) {
        mobileControlsBtn.onclick = () => {
            const controlsTab = document.querySelector('.mobile-nav-item[data-mobile-tab="controls"]');
            if (controlsTab) controlsTab.click();
        };
    }

    // Mobile Settings (Profile & Sync) Quick Action
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    if (mobileSettingsBtn) {
        mobileSettingsBtn.onclick = () => {
            document.getElementById('mobile-sync-modal').classList.add('active');
        };
    }

    // Mobile Sync Modal Close
    const mobileSyncCloseBtn = document.getElementById('mobile-sync-close-btn');
    if (mobileSyncCloseBtn) {
        mobileSyncCloseBtn.onclick = () => {
            document.getElementById('mobile-sync-modal').classList.remove('active');
        };
    }

    // Mobile Add Game Redirection
    const mobileAddGameBtn = document.getElementById('mobile-add-game-btn');
    if (mobileAddGameBtn) {
        mobileAddGameBtn.onclick = () => {
            // Close modal
            document.getElementById('mobile-sync-modal').classList.remove('active');
            
            // Switch to My Games tab
            const gamesTab = document.querySelector('.mobile-nav-item[data-mobile-tab="games"]');
            if (gamesTab) {
                gamesTab.click();
                
                // Scroll to "Add new game" section after a short delay
                setTimeout(() => {
                    const panels = document.querySelectorAll('.glass-panel');
                    panels.forEach(panel => {
                        const title = panel.querySelector('span')?.textContent || "";
                        if (title.includes('Add new game') || title.includes('Edit game')) {
                            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                }, 300);
            }
        };
    }

    // Mobile Import/Export Data
    const mobileImportBtn = document.getElementById('mobile-import-data-btn');
    const mobileExportBtn = document.getElementById('mobile-export-data-btn');
    
    if (mobileImportBtn) {
        mobileImportBtn.onclick = () => {
            document.getElementById('mobile-sync-modal').classList.remove('active');
            document.getElementById('import-data-file').click();
        };
    }
    
    if (mobileExportBtn) {
        mobileExportBtn.onclick = () => {
            document.getElementById('export-data-btn').click();
        };
    }

    // Mobile Fullscreen Toggles
    const toggleFS = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const updateFSBtnText = (btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const span = btn.querySelector('span');
        const icon = btn.querySelector('i');
        if (document.fullscreenElement) {
            if (span) span.textContent = 'Exit Fullscreen';
            if (icon) icon.className = 'fas fa-compress';
        } else {
            if (span) span.textContent = 'Fullscreen';
            if (icon) icon.className = 'fas fa-expand';
        }
    };

    const mobileSyncFSBtn = document.getElementById('mobile-sync-fullscreen-btn');
    if (mobileSyncFSBtn) {
        mobileSyncFSBtn.onclick = toggleFS;
    }

    const mobileControlsFSBtn = document.getElementById('mobile-controls-fullscreen-btn');
    if (mobileControlsFSBtn) {
        mobileControlsFSBtn.onclick = toggleFS;
    }

    document.addEventListener('fullscreenchange', () => {
        updateFSBtnText('mobile-sync-fullscreen-btn');
        updateFSBtnText('mobile-controls-fullscreen-btn');
    });

    // Sync Mobile Time
    const updateMobileTime = () => {
        const timeEl = document.getElementById('mobile-big-time');
        if (timeEl) {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 0 should be 12
            timeEl.innerHTML = `${hours}:${minutes}<span style="font-size: 0.35em; margin-left: 5px; vertical-align: middle; opacity: 0.8;">${ampm}</span>`;
        }
    };
    setInterval(updateMobileTime, 1000);
    updateMobileTime();

    // Initial mobile state
    if (window.innerWidth <= 768) {
        document.body.classList.add('mobile-mode-home');
        const scheme = localStorage.getItem('roylays_control_scheme') || 'modern';
        const statusEl = document.getElementById('mobile-controls-status');
        if (statusEl) {
            const name = scheme.charAt(0).toUpperCase() + scheme.slice(1);
            statusEl.textContent = name;
        }
    }
}

function fillMobileGrid(games) {
    const grid = document.getElementById('mobile-app-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const favorites = JSON.parse(localStorage.getItem('roylays_favorites') || '[]');

    games.forEach(game => {
        const isFavorite = favorites.includes(game.appId);
        const container = document.createElement('a');
        container.className = 'mobile-app-icon-container';
        container.href = getPlayUrl(game.appId);
        container.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') {
                container.href = getPlayUrl(game.appId, true);
            }
        });

        const iconDiv = document.createElement('div');
        iconDiv.className = 'mobile-app-icon';
        
        const img = document.createElement('img');
        img.src = game.icon;
        iconDiv.appendChild(img);

        // Add favorite indicator
        if (isFavorite) {
            const heart = document.createElement('div');
            heart.className = 'mobile-app-favorite';
            heart.innerHTML = '<i class="fas fa-heart"></i>';
            iconDiv.appendChild(heart);
        }

        const name = document.createElement('div');
        name.className = 'mobile-app-name';
        name.textContent = game.name;

        container.appendChild(iconDiv);
        container.appendChild(name);
        grid.appendChild(container);
    });
}

function updateSidebarActive(id) {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => item.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

async function maybeReadCheerpJFileText(path) {
    const blob = await cjFileBlob(path);
    if (blob) {
        return await blob.text();
    }
}

async function getDataUrlFromBlob(blob) {
    const reader = new FileReader();

    const promise = new Promise((r) => {
        reader.onload = function () {
            r(reader.result);
        };
    });

    reader.readAsDataURL(blob);
    return await promise;
}

function readToKv(txt, kv) {
    for (const line of txt.trim().split("\n")) {
        const parts = line.split(/\s*:\s*/);
        if (parts.length == 2) {
            kv[parts[0]] = parts[1];
        }
    }
}

async function javaToKv(hashMap, kv) {
    const es = await hashMap.entrySet();
    const esi = await es.iterator();

    while (await esi.hasNext()) {
        const entry = await esi.next();
        const key = await entry.getKey();
        const value = await entry.getValue();

        kv[key] = value;
    }
}

async function kvToJava(kv) {
    const HashMap = await lib.java.util.HashMap;
    const ret = await new HashMap();

    for (const k of Object.keys(kv)) {
        await ret.put(k, kv[k]);
    }

    return ret;
}

async function loadGames() {
    const apps = [];

    let installedAppsBlob = await cjFileBlob("/files/apps.list");
    
    // Check if we need to migrate from old defaults or if it's a fresh install
    let needsMigration = false;
    if (installedAppsBlob) {
        const text = await installedAppsBlob.text();
        const requiredGames = ["diamond_rush", "brickbreaker", "assassins_creed_3"];
        const hasAllGames = requiredGames.every(id => text.includes(id));

        if (text.includes("k4kur0") || text.includes("Connect4") || !hasAllGames) {
            needsMigration = true;
        } else {
            // Also check if icons are missing for the new games
            const drIcon = await cjFileBlob("/files/diamond_rush/icon");
            const ac3Icon = await cjFileBlob("/files/assassins_creed_3/icon");
            const bbIcon = await cjFileBlob("/files/brickbreaker/icon");
            if (!drIcon || !bbIcon || !ac3Icon) {
                needsMigration = true;
            }
        }
    }

    if (!installedAppsBlob || needsMigration) {
        const res = await fetch("init.zip?v=" + Date.now());
        const ab = await res.arrayBuffer();
        await launcherUtil.importData(new Int8Array(ab));

        installedAppsBlob = await cjFileBlob("/files/apps.list");
    }

    if (installedAppsBlob) {
        let installedIds = (await installedAppsBlob.text()).trim().split("\n");
        
        // Filter out uninstalled games
        installedIds = installedIds.filter(id => id !== "k4kur0" && id !== "Connect4" && id.trim() !== "");

        for (const appId of installedIds) {
            const napp = {
                appId,
                name: appId,
                icon: emptyIcon,
                settings: { ...defaultSettings },
                appProperties: {},
                systemProperties: {},
            };

            const name = await maybeReadCheerpJFileText("/files/" + appId + "/name");
            if (name) napp.name = name;

            const iconBlob = await cjFileBlob("/files/" + appId + "/icon");
            if (iconBlob) {
                const dataUrl = await getDataUrlFromBlob(iconBlob);
                if (dataUrl) {
                    napp.icon = dataUrl;
                }
            }

            for (const [fname, keyName] of [
                ["/files/" + appId + "/config/settings.conf", "settings"],
                ["/files/" + appId + "/config/appproperties.conf", "appProperties"],
                ["/files/" + appId + "/config/systemproperties.conf", "systemProperties"],
            ]) {
                const content = await maybeReadCheerpJFileText(fname);
                if (content) {
                    readToKv(content, napp[keyName]);
                }
            }

            apps.push(napp);
        }
    }

    return apps;
}

function getPlayUrl(appId, mobile) {
    const scheme = localStorage.getItem('roylays_control_scheme') || 'classical';
    let url = "run?app=" + appId + "&scheme=" + scheme;
    if (mobile) url += "&mobile=1";
    return url;
}

function copyGameLink(appId) {
    const url = new URL(window.location.href);
    url.search = ""; // Clear current search params
    url.pathname = url.pathname.replace(/\/[^\/]*$/, "/run"); // Point to run.html
    url.searchParams.set("app", appId);
    
    const shareUrl = url.toString();
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Link copied to clipboard!");
    }).catch(err => {
        console.error("Could not copy link:", err);
    });
}

function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "toast show";
    setTimeout(() => {
        toast.className = "toast";
    }, 3000);
}

function fillGamesList(games, filterFavorites = false) {
    const container = document.getElementById("game-list");
    container.innerHTML = "";

    const favorites = JSON.parse(localStorage.getItem('roylays_favorites') || '[]');

    for (const game of games) {
        if (filterFavorites && !favorites.includes(game.appId)) {
            continue;
        }

        const card = document.createElement("div");
        card.className = "game-card";

        // Thumbnail area with icon
        const thumb = document.createElement("div");
        thumb.className = "game-card-thumb";

        const icon = document.createElement("img");
        icon.src = game.icon;
        thumb.appendChild(icon);

        // Favorite toggle
        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn" + (favorites.includes(game.appId) ? " active" : "");
        favBtn.innerHTML = '<i class="' + (favorites.includes(game.appId) ? "fas" : "far") + ' fa-heart"></i>';
        favBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentFavs = JSON.parse(localStorage.getItem('roylays_favorites') || '[]');
            if (currentFavs.includes(game.appId)) {
                const index = currentFavs.indexOf(game.appId);
                currentFavs.splice(index, 1);
                favBtn.classList.remove("active");
                favBtn.innerHTML = '<i class="far fa-heart"></i>';
            } else {
                currentFavs.push(game.appId);
                favBtn.classList.add("active");
                favBtn.innerHTML = '<i class="fas fa-heart"></i>';
            }
            localStorage.setItem('roylays_favorites', JSON.stringify(currentFavs));
            
            if (filterFavorites) {
                card.remove();
            }
        };
        thumb.appendChild(favBtn);

        // Share button in card thumb
        const cardShare = document.createElement("button");
        cardShare.className = "card-share-btn";
        cardShare.innerHTML = '<i class="fas fa-share-alt"></i>';
        cardShare.title = "Share Game";
        cardShare.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyGameLink(game.appId);
        };
        thumb.appendChild(cardShare);

        // Play overlay
        const playOverlay = document.createElement("a");
        playOverlay.className = "play-overlay";
        playOverlay.href = getPlayUrl(game.appId);
        playOverlay.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') {
                playOverlay.href = getPlayUrl(game.appId, true);
            }
        });
        playOverlay.innerHTML = '<i class="fas fa-play"></i>';
        thumb.appendChild(playOverlay);

        card.appendChild(thumb);

        // Info area
        const info = document.createElement("div");
        info.className = "game-card-info";

        const title = document.createElement("div");
        title.className = "game-card-title";
        title.textContent = game.name;
        info.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "game-card-meta";
        meta.textContent = "Java ME Game";
        info.appendChild(meta);

        card.appendChild(info);

        // Action buttons
        const actions = document.createElement("div");
        actions.className = "game-card-actions";

        const playBtn = document.createElement("a");
        playBtn.className = "game-card-btn";
        playBtn.href = getPlayUrl(game.appId);
        playBtn.textContent = "▶ Play";
        playBtn.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') {
                playBtn.href = getPlayUrl(game.appId, true);
            }
        });
        actions.appendChild(playBtn);

        const manageBtn = document.createElement("button");
        manageBtn.className = "game-card-btn";
        manageBtn.textContent = "⚙ Manage";
        manageBtn.onclick = () => openEditGame(game);
        actions.appendChild(manageBtn);

        card.appendChild(actions);
        container.appendChild(card);
    }
}

function setupAddMode() {
    if (!confirmDiscard()) {
        return;
    }
    state.currentGame = {
        icon: emptyIcon,
        settings: { ...defaultSettings },
        appProperties: {},
        systemProperties: {},
    };

    document.getElementById("add-edit-text").textContent = "Add new game";

    document.getElementById("file-input-step").style.display = "";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("add-manage-step").style.display = "none";

    document.getElementById("game-file-input").disabled = false;
    document.getElementById("game-file-input").value = null;

    document.getElementById("game-file-input").onchange = async (e) => {
        // read file to arraybuffer
        const file = e.target.files[0];
        if (file) {
            if (!(await requestPin())) {
                e.target.value = null;
                return;
            }

            document.getElementById("game-file-input").disabled = true;
            document.getElementById("file-input-step").style.display = "none";
            document.getElementById("file-input-loading").style.display = "";

            const reader = new FileReader();
            reader.onload = async () => {
                const arrayBuffer = reader.result;
                await processGameFile(arrayBuffer, file.name);
            };
            reader.readAsArrayBuffer(file);
        }
    };
}

async function processGameFile(fileBuffer, fileName) {
    const MIDletLoader = await lib.org.recompile.mobile.MIDletLoader;
    const File = await lib.java.io.File;

    const jarFile = await new File(
        "/files/_tmp/" + state.uploadedJars++ + ".jar"
    );

    await launcherUtil.copyJar(new Int8Array(fileBuffer), jarFile);
    state.currentGame.jarFile = jarFile;

    const AnalyserUtil = await lib.pl.zb3.freej2me.launcher.AnalyserUtil;
    const analysisResult = await AnalyserUtil.analyseFile(jarFile, fileName);
    fillGuessedSettings(analysisResult, state.currentGame);

    if (state.lastLoader) {
        await state.lastLoader.close();
    }
    const loader = await MIDletLoader.getMIDletLoader(jarFile);
    state.lastLoader = loader;

    if (!(await loader.getAppId())) {
        document.getElementById("file-input-step").style.display = "";
        document.getElementById("file-input-loading").style.display = "none";
        document.getElementById("file-input-jad-step").style.display = "";
        document.getElementById("upload-descriptor-file-input").value = null;

        document.getElementById("upload-descriptor-file-input").onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById("file-input-step").style.display = "none";
                document.getElementById("file-input-jad-step").style.display = "none";
                document.getElementById("file-input-loading").style.display = "";

                const reader = new FileReader();
                reader.onload = async () => {
                    const arrayBuffer = reader.result;
                    await launcherUtil.augementLoaderWithJAD(
                        loader,
                        new Int8Array(arrayBuffer)
                    );

                    if (await loader.getAppId()) {
                        setupNewGameManage(loader);
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        };

        document.getElementById('continue-without-jad').onclick = () => {
            continueWithoutJAD(loader, fileName);
        };
    } else {
        setupNewGameManage(loader);
    }
}

function fillGuessedSettings(analysisResult, app) {
    if (analysisResult.screenWidth !== -1) {
        app.settings.width = analysisResult.screenWidth + '';
        app.settings.height = analysisResult.screenHeight + '';
    }

    if (analysisResult.phoneType) {
        app.settings.phone = analysisResult.phoneType;
    }
}

async function continueWithoutJAD(loader, origName) {
    // if we're here then need fallback name
    await launcherUtil.ensureAppId(loader, origName);
    loader.name = await loader.getAppId();

    setupNewGameManage(loader);
}

async function setupNewGameManage(loader) {
    state.currentGame.appId = await loader.getAppId();
    state.currentGame.name = loader.name || state.currentGame.appId;
    const iconBytes = await loader.getIconBytes();
    state.currentGame.icon = iconBytes
        ? await getDataUrlFromBlob(new Blob([iconBytes]))
        : emptyIcon;

    await javaToKv(loader.properties, state.currentGame.appProperties);

    setupAddManageGame(state.currentGame, true);
}

async function setupAddManageGame(app, isAdding) {
    document.getElementById("file-input-step").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("add-manage-step").style.display = "";

    const previewIcon = document.querySelector(".preview-icon");
    previewIcon.src = app.icon || emptyIcon;

    const previewName = document.querySelector(".preview-name");
    previewName.textContent = app.name;

    const previewControls = document.getElementById("preview-controls");
    previewControls.style.display = isAdding ? "none" : "";
    if (!isAdding) {
        document.getElementById("uninstall-btn").disabled = false;
        document.getElementById("uninstall-btn").onclick = async (e) => {
            if (await requestPin()) {
                if (!confirm("Do you want to uninstall " + app.name + "?")) {
                    return;
                }

                document.getElementById("uninstall-btn").disabled = true;
                doUninstallGame(app.appId);
            }
        };

        document.getElementById("wipe-data-btn").disabled = false;
        document.getElementById("wipe-data-btn").onclick = async (e) => {
            if (await requestPin()) {
                if (!confirm("Do you want wipe " + app.name + " rms storage?")) {
                    return;
                }

                document.getElementById("wipe-data-btn").disabled = true;
                doWipeData(app.appId);
            }
        };
    }

    const jadFileInput = document.getElementById("aux-jad-file-input");
    jadFileInput.value = null;
    jadFileInput.onchange = handleOptionalJadFileUpload;

    const phoneType = document.getElementById("phoneType");
    phoneType.value = app.settings.phone;

    const screenSize = document.getElementById("screenSize");

    const sizeStr = `${app.settings.width}x${app.settings.height}`;
    if ([...screenSize.options].some((opt) => opt.value === sizeStr)) {
        screenSize.value = sizeStr;
    } else {
        screenSize.value = "custom";
    }
    document.getElementById("customWidth").value = app.settings.width;
    document.getElementById("customHeight").value = app.settings.height;
    screenSize.onchange = adjustScreenSizeInput;
    adjustScreenSizeInput();

    const fontSize = document.getElementById("fontSize");
    if (app.settings.fontSize) {
        fontSize.value = app.settings.fontSize;
    }

    const dgFormat = document.getElementById("dgFormat");
    if (app.settings.dgFormat) {
        dgFormat.value = app.settings.dgFormat;
    }

    document.querySelector('input[name="enableSound"]').checked = true; // Force sound on by default
    document.querySelector('input[name="rotate"]').checked = app.settings.rotate === "on";
    document.querySelector('input[name="forceFullscreen"]').checked = app.settings.forceFullscreen === "on";
    document.querySelector('input[name="textureDisableFilter"]').checked = app.settings.textureDisableFilter === "on";
    document.querySelector('input[name="queuedPaint"]').checked = app.settings.queuedPaint === "on";

    const appPropsTextarea = document.getElementById("editAppProps");
    appPropsTextarea.value = Object.entries(app.appProperties || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

    const sysPropsTextarea = document.getElementById("editSysProps");
    sysPropsTextarea.value = Object.entries(app.systemProperties || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

    document.getElementById("add-save-button").disabled = false;
    document.getElementById("add-save-button").textContent = isAdding ? "Add game" : "Save game";
    document.getElementById("add-save-button").onclick = doAddSaveGame;
}

function adjustScreenSizeInput() {
    document.getElementById("edit-custom-size-inputs").style.display =
        document.getElementById("screenSize").value === "custom" ? "" : "none";
}

function handleOptionalJadFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("add-manage-step").style.display = "none";
    document.getElementById("file-input-loading").style.display = "";

    // read as text?
    const reader = new FileReader();
    reader.onload = async () => {
        // this won't affect the name/id
        readToKv(reader.result, state.currentGame.appProperties);

        const appPropsTextarea = document.getElementById("editAppProps");
        appPropsTextarea.value = Object.entries(
            state.currentGame.appProperties || {}
        )
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");
    };
    reader.onloadend = () => {
        document.getElementById("add-manage-step").style.display = "";
        document.getElementById("file-input-loading").style.display = "none";
    };
    reader.readAsText(file);
}

async function doAddSaveGame() {
    document.getElementById("add-save-button").disabled = true;

    readUI(state.currentGame);

    const jsettings = await kvToJava(state.currentGame.settings);
    const jappProps = await kvToJava(state.currentGame.appProperties);
    const jsysProps = await kvToJava(state.currentGame.systemProperties);

    if (state.currentGame.jarFile) {
        // new game
        await launcherUtil.initApp(
            state.currentGame.jarFile,
            state.lastLoader, // loader with added properties, for name..
            jsettings,
            jappProps,
            jsysProps
        );
    } else {
        await launcherUtil.saveApp(
            state.currentGame.appId,
            jsettings,
            jappProps,
            jsysProps
        );
    }

    reloadUI();
}

function readUI(targetGameObj) {
    targetGameObj.settings.phone = document.getElementById("phoneType").value;

    const screenSize = document.getElementById("screenSize").value;
    if (screenSize === "custom") {
        targetGameObj.settings.width = document.getElementById("customWidth").value;
        targetGameObj.settings.height = document.getElementById("customHeight").value;
    } else {
        const [width, height] = screenSize.split("x");
        targetGameObj.settings.width = width;
        targetGameObj.settings.height = height;
    }

    targetGameObj.settings.fontSize = document.getElementById("fontSize").value;
    targetGameObj.settings.dgFormat = document.getElementById("dgFormat").value;

    targetGameObj.settings.sound = document.querySelector('input[name="enableSound"]').checked ? "on" : "off";
    targetGameObj.settings.rotate = document.querySelector('input[name="rotate"]').checked ? "on" : "off";
    targetGameObj.settings.forceFullscreen = document.querySelector('input[name="forceFullscreen"]').checked ? "on" : "off";
    targetGameObj.settings.textureDisableFilter = document.querySelector('input[name="textureDisableFilter"]').checked ? "on" : "off";
    targetGameObj.settings.queuedPaint = document.querySelector('input[name="queuedPaint"]').checked ? "on" : "off";

    readToKv(document.getElementById("editAppProps").value, targetGameObj.appProperties);
    readToKv(document.getElementById("editSysProps").value, targetGameObj.systemProperties);
}

function openEditGame(gameObj) {
    if (!confirmDiscard()) {
        return;
    }
    state.currentGame = gameObj;
    document.getElementById("add-edit-text").textContent = "Edit game";

    setupAddManageGame(gameObj, false);
}

function confirmDiscard() {
    if (state.currentGame != null && (state.currentGame.jarFile || state.currentGame.appId)) {
        if (!confirm("Discard changes?")) {
            return false;
        }
    }

    return true;
}

async function reloadUI() {
    state.currentGame = null;

    state.games = await loadGames();
    fillGamesList(state.games, activeTab === 'favorites');
    if (window.innerWidth <= 768) {
        fillMobileGrid(state.games);
    }
    setupAddMode();
}

async function doUninstallGame(appId) {
    await launcherUtil.uninstallApp(appId);
    await reloadUI();
}

async function doWipeData(appId) {
    await launcherUtil.wipeAppData(appId);
    document.getElementById("wipe-data-btn").disabled = false;
}

function doImportData(e) {
    if (e.target.files.length > 0) {
        document.getElementById("import-data-btn").disabled = true;

        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const arrayBuffer = reader.result;
                await launcherUtil.importData(new Int8Array(arrayBuffer));
                await reloadUI();
            } catch (error) {
                console.error("Error importing data:", error);
            }
        };
        reader.onloadend = () => {
            document.getElementById("import-data-btn").disabled = false;
        };
        reader.readAsArrayBuffer(file);
    }
}

async function doExportData() {
    try {
        const exportedData = await launcherUtil.exportData();
        const blob = new Blob([exportedData.buffer], { type: "application/zip" });

        const objectURL = URL.createObjectURL(blob);
        const downloadLink = document.getElementById("export-data-link");

        downloadLink.href = objectURL;
        downloadLink.click();
        setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    } catch (error) {
        console.error("Error exporting data:", error);
        alert("Error exporting data");
    }
}

main();
