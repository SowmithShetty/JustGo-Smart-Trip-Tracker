/**
 * Active Tracking Page — Immersive Mode-Specific HUD with Three.js.
 *
 *  🚶 WALK  → "Zen Explorer"   — Compass rose + firefly particles, serene cyan
 *  🏃 RUN   → "Neon Pulse"     — Heartbeat ring + energy burst, electric green
 *  🚗 DRIVE → "Turbo Cockpit"  — Tachometer gauge + flame particles, hot magenta
 */

import { GeoTracker, formatDuration, formatDistance, formatSpeed } from '../services/geo.js';
import { cacheTrackingSession, clearCachedSession, getLocalSettings } from '../services/storage.js';

let tracker = null;
let map = null;
let polyline = null;
let marker = null;
let timerInterval = null;

// Three.js refs
let modeScene, modeCamera, modeRenderer, modeAnimId;
let currentVisualSpeed = 0;
let targetVisualSpeed = 0;

// ── Mode Themes ──────────────────────────────────────────

const MODE_THEMES = {
    walk: {
        name: 'Zen Explorer',
        icon: '🚶',
        tagline: 'Every step is a story',
        color: '#00FFFF',
        colorVar: 'var(--neon-cyan)',
        glowVar: 'var(--neon-cyan-glow)',
        gradient: 'linear-gradient(135deg, #00FFFF, #0099CC)',
        polylineColor: '#00E5CC',
        polylineGlow: 'rgba(0,229,204,0.5)',
        hudBg: 'rgba(0,20,30,0.88)',
        hudBorder: 'rgba(0,255,255,0.25)',
        badgeBg: 'rgba(0,40,50,0.9)',
        statColor: '#00FFFF',
        particleColors: [0x00FFFF, 0x00CCAA, 0x88FFEE, 0x33FFDD],
        milestones: ['🌿 Nature awaits', '🧭 Keep exploring', '🌅 Enjoy the journey', '✨ You\'re doing great'],
    },
    run: {
        name: 'Neon Pulse',
        icon: '🏃',
        tagline: 'Push your limits',
        color: '#39FF14',
        colorVar: 'var(--neon-green)',
        glowVar: 'var(--neon-green-glow)',
        gradient: 'linear-gradient(135deg, #39FF14, #00CC44)',
        polylineColor: '#39FF14',
        polylineGlow: 'rgba(57,255,20,0.5)',
        hudBg: 'rgba(5,20,5,0.88)',
        hudBorder: 'rgba(57,255,20,0.25)',
        badgeBg: 'rgba(10,30,10,0.9)',
        statColor: '#39FF14',
        particleColors: [0x39FF14, 0x00FF44, 0xAAFF00, 0x66FF33],
        milestones: ['🔥 Feel the burn', '⚡ Unstoppable', '💪 Beast mode ON', '🚀 You\'re on fire'],
    },
    drive: {
        name: 'Turbo Cockpit',
        icon: '🚗',
        tagline: 'Own the road',
        color: '#FF007F',
        colorVar: 'var(--neon-magenta)',
        glowVar: 'var(--neon-magenta-glow)',
        gradient: 'linear-gradient(135deg, #FF007F, #FF4444)',
        polylineColor: '#FF3377',
        polylineGlow: 'rgba(255,51,119,0.5)',
        hudBg: 'rgba(30,5,15,0.88)',
        hudBorder: 'rgba(255,0,127,0.25)',
        badgeBg: 'rgba(40,5,20,0.9)',
        statColor: '#FF007F',
        particleColors: [0xFF007F, 0xFF4444, 0xFF6600, 0xFFAA00],
        milestones: ['🏎️ Cruising smooth', '🛣️ Open road ahead', '⚡ Full throttle', '🏁 Drive on, champion'],
    },
};

// ── Render ────────────────────────────────────────────────

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const mode = localStorage.getItem('justgo_mode') || 'walk';
    const theme = MODE_THEMES[mode] || MODE_THEMES.walk;

    container.innerHTML = `
        <div class="page tracking-page" style="padding:0; position:relative;">
            <!-- Full-screen Map -->
            <div class="map-container fullscreen" id="tracking-map" style="border-radius:0; border:none;"></div>

            <!-- Three.js Mode Overlay -->
            <div id="mode-3d-mount" style="position:absolute; inset:0; z-index:40; pointer-events:none;"></div>

            <!-- Top Mode Badge -->
            <div class="tracking-badge-wrap">
                <div class="tracking-badge" style="
                    border-color:${theme.color};
                    box-shadow: 0 0 24px ${theme.color}30, inset 0 0 20px ${theme.color}08;
                    background:${theme.badgeBg};
                ">
                    <span class="tracking-badge-dot" style="background:${theme.color}; box-shadow:0 0 8px ${theme.color};"></span>
                    <span class="tracking-badge-icon">${theme.icon}</span>
                    <span class="tracking-badge-mode" style="color:${theme.color};">${mode.toUpperCase()}</span>
                    <span class="tracking-badge-sep">·</span>
                    <span class="tracking-badge-live">TRACKING LIVE</span>
                </div>
            </div>

            <!-- Motivational Banner (changes during trip) -->
            <div id="motive-banner" class="motive-banner" style="color:${theme.color}; text-shadow: 0 0 20px ${theme.color}60;">
                <span class="motive-tagline">${theme.tagline}</span>
            </div>

            <!-- Mode-Specific HUD Panel -->
            <div class="tracking-hud-wrap">
                <div class="tracking-hud" style="
                    background:${theme.hudBg};
                    border-color:${theme.hudBorder};
                    box-shadow: 0 0 50px ${theme.color}15, inset 0 1px 0 rgba(255,255,255,0.04);
                ">
                    <!-- Mode-colored corner accents -->
                    <div class="hud-corner hud-corner-tl" style="border-color:${theme.color};"></div>
                    <div class="hud-corner hud-corner-tr" style="border-color:${theme.color};"></div>
                    <div class="hud-corner hud-corner-bl" style="border-color:${theme.color};"></div>
                    <div class="hud-corner hud-corner-br" style="border-color:${theme.color};"></div>

                    <!-- Scanline overlay -->
                    <div class="hud-scanline" style="
                        background:repeating-linear-gradient(0deg, transparent, transparent 3px, ${theme.color}06 3px, ${theme.color}06 4px);
                    "></div>

                    <!-- Mode name strip -->
                    <div class="hud-mode-strip" style="
                        background: linear-gradient(90deg, transparent, ${theme.color}15, transparent);
                        border-bottom: 1px solid ${theme.color}20;
                    ">
                        <span style="color:${theme.color}; font-family:var(--font-mono); font-size:0.6rem; letter-spacing:0.2em; text-transform:uppercase;">
                            ◈ ${theme.name} ◈
                        </span>
                    </div>

                    <!-- Stats -->
                    <div class="stats-hud" style="margin-bottom:var(--space-sm);">
                        <div class="stat-card">
                            <div class="stat-value" id="live-speed" style="color:${theme.statColor}; text-shadow: 0 0 20px ${theme.color}50;">0.0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'MPH' : 'KM/H'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="live-distance" style="color:${theme.statColor}; text-shadow: 0 0 20px ${theme.color}50;">0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'MILES' : 'KM'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="live-time" style="color:${theme.statColor}; text-shadow: 0 0 20px ${theme.color}50;">0:00</div>
                            <div class="stat-label">TIME</div>
                        </div>
                    </div>

                    ${mode === 'drive' ? `
                    <!-- Drive-only: Max Speed -->
                    <div class="hud-max-speed" style="border-top:1px solid ${theme.color}15;">
                        <span style="color:var(--text-tertiary); font-family:var(--font-mono); font-size:0.6rem; letter-spacing:0.1em;">MAX SPEED</span>
                        <span id="max-speed-val" style="color:${theme.color}; font-family:var(--font-mono); font-size:0.85rem; font-weight:700;">0.0 ${settings.units === 'mi' ? 'mph' : 'km/h'}</span>
                    </div>
                    ` : ''}

                    ${mode === 'run' ? `
                    <!-- Run-only: Pace -->
                    <div class="hud-max-speed" style="border-top:1px solid ${theme.color}15;">
                        <span style="color:var(--text-tertiary); font-family:var(--font-mono); font-size:0.6rem; letter-spacing:0.1em;">AVG PACE</span>
                        <span id="avg-pace-val" style="color:${theme.color}; font-family:var(--font-mono); font-size:0.85rem; font-weight:700;">0:00 /km</span>
                    </div>
                    ` : ''}

                    <!-- Controls -->
                    <div class="tracking-controls">
                        <button class="pause-btn" id="pause-btn" title="Pause / Resume" style="border-color:${theme.color}40;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1"/>
                                <rect x="14" y="4" width="4" height="16" rx="1"/>
                            </svg>
                        </button>
                        <button class="stop-btn" id="stop-btn" title="Stop Trip" style="
                            background:${theme.gradient};
                            box-shadow: 0 4px 24px ${theme.color}50, 0 0 0 4px ${theme.color}15;
                        ">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                            <span style="font-size:0.55rem; letter-spacing:0.1em;">STOP</span>
                        </button>
                        <button class="pause-btn" id="recenter-btn" title="Re-center map" style="opacity:0.7; border-color:${theme.color}40;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    initMap(theme);
    initMode3DScene(mode, theme);
    startTracking(mode, theme);
    timerInterval = setInterval(() => updateTimer(mode), 1000);

    // Motivational banner rotation
    let motiveIdx = 0;
    setInterval(() => {
        motiveIdx = (motiveIdx + 1) % theme.milestones.length;
        const banner = document.getElementById('motive-banner');
        if (banner) {
            banner.style.opacity = '0';
            setTimeout(() => {
                const tagline = banner.querySelector('.motive-tagline');
                if (tagline) tagline.textContent = theme.milestones[motiveIdx];
                banner.style.opacity = '1';
            }, 400);
        }
    }, 8000);

    let isPaused = false;

    document.getElementById('pause-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('pause-btn');
        if (isPaused) {
            tracker?.resume();
            isPaused = false;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
        } else {
            tracker?.pause();
            isPaused = true;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
        }
    });

    document.getElementById('stop-btn')?.addEventListener('click', () => stopTracking(onNavigate));

    document.getElementById('recenter-btn')?.addEventListener('click', () => {
        if (marker && map) map.setView(marker.getLatLng(), map.getZoom());
    });
}

export function cleanup() {
    if (timerInterval) clearInterval(timerInterval);
    if (map) { map.remove(); map = null; }
    if (modeAnimId) cancelAnimationFrame(modeAnimId);
    if (modeRenderer) { modeRenderer.dispose(); modeRenderer = null; }
    modeScene = null; modeCamera = null;
    polyline = null; marker = null;
}

// ── Map ──────────────────────────────────────────────────

function initMap(theme) {
    const mapEl = document.getElementById('tracking-map');
    if (!mapEl || typeof L === 'undefined') return;

    map = L.map(mapEl, { zoomControl: false }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    }).addTo(map);

    polyline = L.polyline([], {
        color: theme.polylineColor,
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1,
    }).addTo(map);

    map.locate({ setView: true, maxZoom: 16 });
}

// ── Tracking ─────────────────────────────────────────────

let maxSpeed = 0;

function startTracking(mode, theme) {
    maxSpeed = 0;

    tracker = new GeoTracker(
        (point, t) => {
            const latLng = [point.latitude, point.longitude];

            if (marker) {
                marker.setLatLng(latLng);
            } else if (map) {
                marker = L.circleMarker(latLng, {
                    radius: 9,
                    fillColor: theme.polylineColor,
                    fillOpacity: 1,
                    color: theme.color,
                    weight: 3,
                }).addTo(map);
            }

            polyline?.addLatLng(latLng);
            map?.setView(latLng, map.getZoom() < 14 ? 15 : map.getZoom());

            const settings = getLocalSettings();
            const speedEl = document.getElementById('live-speed');
            const distEl = document.getElementById('live-distance');

            if (speedEl) {
                const spd = settings.units === 'mi' ? t.currentSpeed * 0.621371 : t.currentSpeed;
                speedEl.textContent = spd.toFixed(1);
                targetVisualSpeed = spd;
            }
            if (distEl) {
                const dist = settings.units === 'mi' ? t.totalDistance * 0.621371 : t.totalDistance;
                distEl.textContent = dist < 1
                    ? (dist * (settings.units === 'mi' ? 5280 : 1000)).toFixed(0)
                    : dist.toFixed(2);
            }

            // Drive: update max speed
            if (mode === 'drive') {
                const rawSpd = settings.units === 'mi' ? t.currentSpeed * 0.621371 : t.currentSpeed;
                if (rawSpd > maxSpeed) maxSpeed = rawSpd;
                const maxEl = document.getElementById('max-speed-val');
                if (maxEl) maxEl.textContent = `${maxSpeed.toFixed(1)} ${settings.units === 'mi' ? 'mph' : 'km/h'}`;
            }

            // Run: update pace
            if (mode === 'run') {
                const paceEl = document.getElementById('avg-pace-val');
                if (paceEl && t.totalDistance > 0.01) {
                    const elapsedMin = tracker.getElapsed() / 60;
                    const distKm = t.totalDistance;
                    const pacePerKm = elapsedMin / distKm;
                    const pMin = Math.floor(pacePerKm);
                    const pSec = Math.floor((pacePerKm - pMin) * 60);
                    paceEl.textContent = `${pMin}:${String(pSec).padStart(2, '0')} /${settings.units === 'mi' ? 'mi' : 'km'}`;
                }
            }

            cacheTrackingSession(t.points, { mode });
        },
        (msg) => console.error('GPS Error:', msg)
    );
    tracker.start();
}

function updateTimer(mode) {
    if (!tracker) return;
    const el = document.getElementById('live-time');
    if (el) el.textContent = formatDuration(tracker.getElapsed());
}

function stopTracking(onNavigate) {
    if (!tracker) return;
    const result = tracker.stop();
    clearCachedSession();

    const mode = localStorage.getItem('justgo_mode') || 'walk';
    sessionStorage.setItem('justgo_trip_result', JSON.stringify({ ...result, mode }));
    onNavigate('summary');
}

// ═══════════════════════════════════════════════════════════
//  THREE.JS MODE-SPECIFIC 3D SCENES
// ═══════════════════════════════════════════════════════════

function initMode3DScene(mode, theme) {
    const mount = document.getElementById('mode-3d-mount');
    if (!mount || typeof THREE === 'undefined') return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    modeScene = new THREE.Scene();
    modeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    modeCamera.position.z = 10;
    modeCamera.position.y = 2;
    modeCamera.lookAt(0, 0, 0);

    modeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    modeRenderer.setSize(w, h);
    modeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(modeRenderer.domElement);

    const baseColor = new THREE.Color(theme.color);

    let animateFn;

    switch (mode) {
        case 'walk':
            animateFn = buildWalkScene(baseColor, theme);
            break;
        case 'run':
            animateFn = buildRunScene(baseColor, theme);
            break;
        case 'drive':
            animateFn = buildDriveScene(baseColor, theme);
            break;
        default:
            animateFn = buildWalkScene(baseColor, theme);
    }

    function animate() {
        modeAnimId = requestAnimationFrame(animate);
        if (!modeScene) return;

        currentVisualSpeed += (targetVisualSpeed - currentVisualSpeed) * 0.08;
        animateFn(currentVisualSpeed);
        modeRenderer.render(modeScene, modeCamera);
    }
    animate();

    const resizeObs = new ResizeObserver(() => {
        if (!mount || !modeRenderer) return;
        const nw = mount.clientWidth, nh = mount.clientHeight;
        modeCamera.aspect = nw / nh;
        modeCamera.updateProjectionMatrix();
        modeRenderer.setSize(nw, nh);
    });
    resizeObs.observe(mount);
}

// ── 🚶 WALK: Zen Explorer — Compass Rose + Firefly Particles ──

function buildWalkScene(baseColor, theme) {
    // Large serene compass ring
    const compassGeo = new THREE.TorusGeometry(3.2, 0.03, 16, 80);
    const compassMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
    });
    const compassRing = new THREE.Mesh(compassGeo, compassMat);
    compassRing.rotation.x = Math.PI / 2.2;
    modeScene.add(compassRing);

    // Inner compass ring
    const innerGeo = new THREE.TorusGeometry(2.5, 0.02, 16, 60);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x88FFEE,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    innerRing.rotation.x = Math.PI / 2.2;
    modeScene.add(innerRing);

    // Compass needle — N/S line
    const needlePts = [new THREE.Vector3(0, 0, -2.8), new THREE.Vector3(0, 0, 2.8)];
    const needleGeo = new THREE.BufferGeometry().setFromPoints(needlePts);
    const needleMat = new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.6 });
    const needle = new THREE.Line(needleGeo, needleMat);
    needle.rotation.x = Math.PI / 2.2;
    modeScene.add(needle);

    // E/W line
    const ewPts = [new THREE.Vector3(-2.8, 0, 0), new THREE.Vector3(2.8, 0, 0)];
    const ewGeo = new THREE.BufferGeometry().setFromPoints(ewPts);
    const ewLine = new THREE.Line(ewGeo, new THREE.LineBasicMaterial({ color: 0x00CCAA, transparent: true, opacity: 0.3 }));
    ewLine.rotation.x = Math.PI / 2.2;
    modeScene.add(ewLine);

    // Cardinal markers — small spheres at N, E, S, W
    const cardinalPositions = [
        [0, 0, -3.0],   // N
        [3.0, 0, 0],    // E
        [0, 0, 3.0],    // S
        [-3.0, 0, 0],   // W
    ];
    const cardinalColors = [0x00FFFF, 0x88FFEE, 0x00CCAA, 0x88FFEE];
    cardinalPositions.forEach((pos, i) => {
        const dotGeo = new THREE.SphereGeometry(0.06, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: cardinalColors[i] });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(...pos);
        dot.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2.2);
        modeScene.add(dot);
    });

    // Firefly particles — gentle, floating
    const fireflyCount = 120;
    const ffGeo = new THREE.BufferGeometry();
    const ffPos = new Float32Array(fireflyCount * 3);
    const ffVel = [];
    for (let i = 0; i < fireflyCount; i++) {
        ffPos[i * 3] = (Math.random() - 0.5) * 12;
        ffPos[i * 3 + 1] = (Math.random() - 0.5) * 8;
        ffPos[i * 3 + 2] = (Math.random() - 0.5) * 6;
        ffVel.push({
            x: (Math.random() - 0.5) * 0.005,
            y: (Math.random() - 0.5) * 0.003,
            z: (Math.random() - 0.5) * 0.004,
        });
    }
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.PointsMaterial({
        color: 0x00FFDD,
        size: 0.06,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
    });
    const fireflies = new THREE.Points(ffGeo, ffMat);
    modeScene.add(fireflies);

    return function animateWalk(speed) {
        // Gentle compass rotation — speed-reactive but always slow
        const rotSpeed = 0.003 + speed * 0.0005;
        compassRing.rotation.z += rotSpeed;
        innerRing.rotation.z -= rotSpeed * 0.6;
        needle.rotation.z += rotSpeed * 0.3;
        ewLine.rotation.z += rotSpeed * 0.3;

        // Gentle breathing scale
        const breath = 1 + Math.sin(Date.now() * 0.002) * 0.03;
        compassRing.scale.set(breath, breath, breath);

        // Animate fireflies
        const positions = fireflies.geometry.attributes.position.array;
        for (let i = 0; i < fireflyCount; i++) {
            positions[i * 3] += ffVel[i].x;
            positions[i * 3 + 1] += ffVel[i].y + Math.sin(Date.now() * 0.001 + i) * 0.002;
            positions[i * 3 + 2] += ffVel[i].z;
            // Wrap around
            if (Math.abs(positions[i * 3]) > 6) ffVel[i].x *= -1;
            if (Math.abs(positions[i * 3 + 1]) > 4) ffVel[i].y *= -1;
            if (Math.abs(positions[i * 3 + 2]) > 3) ffVel[i].z *= -1;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;
        ffMat.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.2;
    };
}

// ── 🏃 RUN: Neon Pulse — Heartbeat Ring + Energy Burst ──

function buildRunScene(baseColor, theme) {
    // Main pulsing ring
    const pulseGeo = new THREE.TorusGeometry(3, 0.06, 16, 100);
    const pulseMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
    });
    const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    pulseRing.rotation.x = Math.PI / 2.2;
    modeScene.add(pulseRing);

    // Secondary thin ring
    const ring2Geo = new THREE.TorusGeometry(3.4, 0.02, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({
        color: 0xAAFF00,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 2.2;
    modeScene.add(ring2);

    // Heartbeat ECG-style line segments
    const heartbeatPoints = [];
    for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * Math.PI * 2;
        const r = 2.6;
        const x = Math.cos(t) * r;
        const z = Math.sin(t) * r;
        // Add heartbeat spike at specific positions
        let y = 0;
        const spike = (i % 25);
        if (spike === 10) y = 0.4;
        else if (spike === 11) y = -0.6;
        else if (spike === 12) y = 0.8;
        else if (spike === 13) y = -0.3;
        else if (spike === 14) y = 0.1;
        heartbeatPoints.push(new THREE.Vector3(x, y, z));
    }
    const hbGeo = new THREE.BufferGeometry().setFromPoints(heartbeatPoints);
    const hbMat = new THREE.LineBasicMaterial({
        color: 0x39FF14,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
    });
    const heartbeatLine = new THREE.Line(hbGeo, hbMat);
    heartbeatLine.rotation.x = Math.PI / 2.2;
    modeScene.add(heartbeatLine);

    // Energy burst particles — directional, fast
    const burstCount = 250;
    const bGeo = new THREE.BufferGeometry();
    const bPos = new Float32Array(burstCount * 3);
    const bVel = [];
    for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 2;
        bPos[i * 3] = Math.cos(angle) * r;
        bPos[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
        bPos[i * 3 + 2] = Math.sin(angle) * r;
        bVel.push({
            angle,
            r,
            speed: 0.01 + Math.random() * 0.02,
            ySpeed: (Math.random() - 0.5) * 0.01,
        });
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    const bMat = new THREE.PointsMaterial({
        color: 0x66FF33,
        size: 0.05,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
    });
    const burstParticles = new THREE.Points(bGeo, bMat);
    modeScene.add(burstParticles);

    let heartbeatPhase = 0;

    return function animateRun(speed) {
        // Heartbeat pulse — frequency increases with speed
        heartbeatPhase += 0.03 + speed * 0.005;
        const beat = Math.abs(Math.sin(heartbeatPhase));
        const beatScale = 1 + beat * 0.08 * Math.min(speed / 5, 1);
        pulseRing.scale.set(beatScale, beatScale, beatScale);
        pulseMat.opacity = 0.3 + beat * 0.4;

        // Ring rotation — faster with speed
        const rotSpeed = 0.008 + speed * 0.002;
        pulseRing.rotation.z += rotSpeed;
        ring2.rotation.z -= rotSpeed * 0.7;
        heartbeatLine.rotation.z += rotSpeed * 1.2;

        // Energy burst particles orbit faster with speed
        const positions = burstParticles.geometry.attributes.position.array;
        for (let i = 0; i < burstCount; i++) {
            bVel[i].angle += bVel[i].speed * (1 + speed * 0.1);
            const r = bVel[i].r + Math.sin(Date.now() * 0.002 + i) * 0.2;
            positions[i * 3] = Math.cos(bVel[i].angle) * r;
            positions[i * 3 + 1] += bVel[i].ySpeed;
            positions[i * 3 + 2] = Math.sin(bVel[i].angle) * r;
            if (Math.abs(positions[i * 3 + 1]) > 1) bVel[i].ySpeed *= -1;
        }
        burstParticles.geometry.attributes.position.needsUpdate = true;

        // Color shift: higher speed adds more yellow/energy
        const energyColor = baseColor.clone().lerp(new THREE.Color(0xFFFF00), Math.min(speed / 20, 0.5));
        pulseMat.color = energyColor;
        bMat.color = energyColor;
    };
}

// ── 🚗 DRIVE: Turbo Cockpit — Tachometer + Flame Particles ──

function buildDriveScene(baseColor, theme) {
    // Main tachometer ring — thick, sporty
    const tachoGeo = new THREE.TorusGeometry(3.2, 0.08, 16, 100, Math.PI * 1.5);
    const tachoMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
    });
    const tachoRing = new THREE.Mesh(tachoGeo, tachoMat);
    tachoRing.rotation.x = Math.PI / 2.2;
    tachoRing.rotation.z = Math.PI * 0.75; // Start from bottom-left
    modeScene.add(tachoRing);

    // Outer decorative ring
    const outerGeo = new THREE.TorusGeometry(3.5, 0.02, 16, 100);
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0xFF4444,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.rotation.x = Math.PI / 2.2;
    modeScene.add(outerRing);

    // Speed indicator needle (line from center to edge)
    const needleLength = 2.8;
    const needlePts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -needleLength)];
    const needleGeo = new THREE.BufferGeometry().setFromPoints(needlePts);
    const needleMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });
    const needle = new THREE.Line(needleGeo, needleMat);
    needle.rotation.x = Math.PI / 2.2;
    modeScene.add(needle);

    // RPM tick marks — small lines around the arc
    for (let i = 0; i <= 12; i++) {
        const angle = (i / 12) * Math.PI * 1.5 + Math.PI * 0.75;
        const innerR = 2.9;
        const outerR = 3.15;
        const pts = [
            new THREE.Vector3(Math.cos(angle) * innerR, 0, Math.sin(angle) * innerR),
            new THREE.Vector3(Math.cos(angle) * outerR, 0, Math.sin(angle) * outerR),
        ];
        const tickGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const tickColor = i >= 9 ? 0xFF007F : i >= 6 ? 0xFF6600 : 0xFFFFFF;
        const tick = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({
            color: tickColor,
            transparent: true,
            opacity: i % 3 === 0 ? 0.7 : 0.3,
        }));
        tick.rotation.x = Math.PI / 2.2;
        modeScene.add(tick);
    }

    // Flame/heat particles — concentrated behind, spreading with speed
    const flameCount = 300;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(flameCount * 3);
    const fColors = new Float32Array(flameCount * 3);
    const fVel = [];
    const flamePalette = [
        [1, 0, 0.5],      // Magenta
        [1, 0.27, 0],      // Orange
        [1, 0.67, 0],      // Amber
        [1, 0, 0.3],       // Hot pink
        [1, 1, 0],         // Yellow (tips)
    ];
    for (let i = 0; i < flameCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 3;
        fPos[i * 3] = Math.cos(angle) * r;
        fPos[i * 3 + 1] = (Math.random() - 0.5) * 2;
        fPos[i * 3 + 2] = Math.sin(angle) * r;
        const c = flamePalette[Math.floor(Math.random() * flamePalette.length)];
        fColors[i * 3] = c[0];
        fColors[i * 3 + 1] = c[1];
        fColors[i * 3 + 2] = c[2];
        fVel.push({
            angle,
            r,
            speed: 0.005 + Math.random() * 0.015,
            ySpeed: (Math.random() - 0.5) * 0.02,
            life: Math.random(),
        });
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    fGeo.setAttribute('color', new THREE.BufferAttribute(fColors, 3));
    const fMat = new THREE.PointsMaterial({
        size: 0.07,
        transparent: true,
        opacity: 0.7,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });
    const flameParticles = new THREE.Points(fGeo, fMat);
    modeScene.add(flameParticles);

    let needleAngle = Math.PI * 0.75; // Start position

    return function animateDrive(speed) {
        // Needle sweeps based on speed — max at ~120 km/h
        const targetAngle = Math.PI * 0.75 + (Math.min(speed, 120) / 120) * Math.PI * 1.5;
        needleAngle += (targetAngle - needleAngle) * 0.06;
        needle.rotation.z = needleAngle;

        // Tachometer ring glow intensifies with speed
        tachoMat.opacity = 0.3 + Math.min(speed / 60, 0.5);
        
        // Color shifts from magenta → orange → yellow at high speed
        const heatLerp = Math.min(speed / 80, 1);
        const heatColor = baseColor.clone().lerp(new THREE.Color(0xFFAA00), heatLerp * 0.6);
        tachoMat.color = heatColor;

        // Outer ring rotation — sporty spin
        outerRing.rotation.z += 0.005 + speed * 0.001;

        // Scale pulse at high speed (engine vibration feel)
        const vibration = speed > 40 ? Math.sin(Date.now() * 0.02) * 0.01 * (speed / 80) : 0;
        tachoRing.scale.set(1 + vibration, 1 + vibration, 1 + vibration);

        // Flame particles — more active at higher speeds
        const positions = flameParticles.geometry.attributes.position.array;
        const speedFactor = 1 + speed * 0.08;
        for (let i = 0; i < flameCount; i++) {
            fVel[i].angle += fVel[i].speed * speedFactor;
            const r = fVel[i].r + Math.sin(Date.now() * 0.003 + i * 0.5) * 0.3;
            positions[i * 3] = Math.cos(fVel[i].angle) * r;
            positions[i * 3 + 1] += fVel[i].ySpeed * speedFactor;
            positions[i * 3 + 2] = Math.sin(fVel[i].angle) * r;
            if (Math.abs(positions[i * 3 + 1]) > 1.5) fVel[i].ySpeed *= -1;
        }
        flameParticles.geometry.attributes.position.needsUpdate = true;

        // Particle opacity increases with speed
        fMat.opacity = 0.3 + Math.min(speed / 40, 0.5);
        fMat.size = 0.05 + Math.min(speed / 200, 0.06);
    };
}
