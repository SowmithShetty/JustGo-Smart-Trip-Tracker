/**
 * Active Tracking Page — Cyberpunk HUD with live GPS stats.
 */

import { GeoTracker, formatDuration, formatDistance, formatSpeed } from '../services/geo.js';
import { cacheTrackingSession, clearCachedSession, getLocalSettings } from '../services/storage.js';

let tracker = null;
let map = null;
let polyline = null;
let marker = null;
let timerInterval = null;

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const mode = localStorage.getItem('justgo_mode') || 'walk';

    const modeColor = mode === 'walk' ? 'var(--neon-cyan)' : mode === 'run' ? 'var(--neon-green)' : 'var(--neon-magenta)';
    const modeIcon  = mode === 'walk' ? '🚶' : mode === 'run' ? '🏃' : '🚗';

    container.innerHTML = `
        <div class="page tracking-page" style="padding:0; position:relative;">
            <!-- Full-screen Map -->
            <div class="map-container fullscreen" id="tracking-map" style="border-radius:0; border:none;"></div>

            <!-- Top Mode Badge -->
            <div style="
                position:fixed; top:84px; left:50%;
                transform:translateX(-50%);
                z-index:50; pointer-events:none;
            ">
                <div style="
                    display:inline-flex; align-items:center; gap:8px;
                    padding:6px 18px; border-radius:30px;
                    background:rgba(5,8,16,0.85); backdrop-filter:blur(12px);
                    border:1px solid ${modeColor};
                    box-shadow: 0 0 20px ${modeColor}40;
                    font-family:var(--font-mono); font-size:0.7rem;
                    font-weight:700; letter-spacing:0.15em;
                    color:${modeColor}; text-transform:uppercase;
                ">
                    <span style="animation:gpsPulse 2s ease-in-out infinite; display:inline-block; width:6px; height:6px; border-radius:50%; background:${modeColor};"></span>
                    ${modeIcon} &nbsp;${mode} &nbsp;·&nbsp; TRACKING LIVE
                </div>
            </div>

            <!-- Cyberpunk HUD Panel -->
            <div style="
                position:fixed; bottom:80px; left:0; right:0;
                z-index:50; padding:0 var(--space-md);
            ">
                <div style="
                    background:rgba(5,8,16,0.88);
                    backdrop-filter:blur(24px) saturate(180%);
                    border:1px solid rgba(167,139,250,0.25);
                    border-radius:var(--radius-lg);
                    padding:var(--space-md) var(--space-md) var(--space-sm);
                    box-shadow: 0 0 40px rgba(167,139,250,0.12), inset 0 1px 0 rgba(255,255,255,0.04);
                    position:relative; overflow:hidden;
                ">
                    <!-- HUD corner decorations -->
                    <div style="position:absolute; top:0; left:0; width:20px; height:20px; border-top:2px solid var(--neon-cyan); border-left:2px solid var(--neon-cyan); border-radius:var(--radius-lg) 0 0 0; opacity:0.7;"></div>
                    <div style="position:absolute; top:0; right:0; width:20px; height:20px; border-top:2px solid var(--neon-cyan); border-right:2px solid var(--neon-cyan); border-radius:0 var(--radius-lg) 0 0; opacity:0.7;"></div>
                    <div style="position:absolute; bottom:0; left:0; width:20px; height:20px; border-bottom:2px solid var(--neon-cyan); border-left:2px solid var(--neon-cyan); border-radius:0 0 0 var(--radius-lg); opacity:0.7;"></div>
                    <div style="position:absolute; bottom:0; right:0; width:20px; height:20px; border-bottom:2px solid var(--neon-cyan); border-right:2px solid var(--neon-cyan); border-radius:0 0 var(--radius-lg) 0; opacity:0.7;"></div>

                    <!-- Scanline -->
                    <div style="
                        position:absolute; inset:0; pointer-events:none;
                        background:repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,245,255,0.015) 3px, rgba(0,245,255,0.015) 4px);
                    "></div>

                    <!-- Stats -->
                    <div class="stats-hud" style="margin-bottom:var(--space-sm);">
                        <div class="stat-card">
                            <div class="stat-value speed" id="live-speed">0.0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'MPH' : 'KM/H'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value distance" id="live-distance">0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'MILES' : 'KM'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value time" id="live-time">0:00</div>
                            <div class="stat-label">TIME</div>
                        </div>
                    </div>

                    <!-- Controls -->
                    <div class="tracking-controls">
                        <button class="pause-btn" id="pause-btn" title="Pause / Resume">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1"/>
                                <rect x="14" y="4" width="4" height="16" rx="1"/>
                            </svg>
                        </button>
                        <button class="stop-btn" id="stop-btn" title="Stop Trip">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                            <span style="font-size:0.55rem; letter-spacing:0.1em;">STOP</span>
                        </button>
                        <button class="pause-btn" id="recenter-btn" title="Re-center map" style="opacity:0.7;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    initMap();
    startTracking();
    timerInterval = setInterval(updateTimer, 1000);

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
    polyline = null; marker = null;
}

function initMap() {
    const mapEl = document.getElementById('tracking-map');
    if (!mapEl || typeof L === 'undefined') return;

    map = L.map(mapEl, { zoomControl: false }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    }).addTo(map);

    polyline = L.polyline([], {
        color: '#A78BFA',
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1,
    }).addTo(map);

    map.locate({ setView: true, maxZoom: 16 });
}

function startTracking() {
    tracker = new GeoTracker(
        (point, t) => {
            const latLng = [point.latitude, point.longitude];

            if (marker) {
                marker.setLatLng(latLng);
            } else if (map) {
                marker = L.circleMarker(latLng, {
                    radius: 9,
                    fillColor: '#A78BFA',
                    fillOpacity: 1,
                    color: '#00F5FF',
                    weight: 3,
                }).addTo(map);
            }

            polyline?.addLatLng(latLng);
            map?.setView(latLng, map.getZoom() < 14 ? 15 : map.getZoom());

            const settings = getLocalSettings();
            const speedEl  = document.getElementById('live-speed');
            const distEl   = document.getElementById('live-distance');

            if (speedEl) {
                const spd = settings.units === 'mi' ? t.currentSpeed * 0.621371 : t.currentSpeed;
                speedEl.textContent = spd.toFixed(1);
            }
            if (distEl) {
                const dist = settings.units === 'mi' ? t.totalDistance * 0.621371 : t.totalDistance;
                distEl.textContent = dist < 1
                    ? (dist * (settings.units === 'mi' ? 5280 : 1000)).toFixed(0)
                    : dist.toFixed(2);
            }

            cacheTrackingSession(t.points, { mode: localStorage.getItem('justgo_mode') || 'walk' });
        },
        (msg) => console.error('GPS Error:', msg)
    );
    tracker.start();
}

function updateTimer() {
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
