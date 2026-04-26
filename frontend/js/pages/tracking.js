/**
 * Active Tracking Page — Live map with GPS tracking and stats HUD.
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

    container.innerHTML = `
        <div class="page tracking-page" style="padding:0;">
            <!-- Map -->
            <div class="map-container fullscreen" id="tracking-map"></div>

            <!-- Stats HUD Overlay -->
            <div style="position:fixed; bottom:80px; left:0; right:0; z-index:50; padding:0 var(--space-md);">
                <div class="glass-card" style="padding:var(--space-md);">
                    <div class="stats-hud">
                        <div class="stat-card">
                            <div class="stat-value speed" id="live-speed">0.0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'mph' : 'km/h'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value distance" id="live-distance">0</div>
                            <div class="stat-label">${settings.units === 'mi' ? 'miles' : 'km'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value time" id="live-time">0:00</div>
                            <div class="stat-label">Time</div>
                        </div>
                    </div>

                    <!-- Controls -->
                    <div class="tracking-controls">
                        <button class="pause-btn" id="pause-btn" title="Pause">⏸</button>
                        <button class="stop-btn" id="stop-btn" title="Stop">STOP</button>
                    </div>
                </div>
            </div>

            <!-- Mode badge -->
            <div style="position:fixed; top:84px; left:50%; transform:translateX(-50%); z-index:50;">
                <div class="trip-mode-badge">${mode}</div>
            </div>
        </div>
    `;

    // ── Initialize Map ──
    initMap();

    // ── Start Tracking ──
    startTracking();

    // ── Timer ──
    timerInterval = setInterval(updateTimer, 1000);

    // ── Controls ──
    let isPaused = false;

    document.getElementById('pause-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('pause-btn');
        if (isPaused) {
            tracker?.resume();
            isPaused = false;
            if (btn) btn.textContent = '⏸';
        } else {
            tracker?.pause();
            isPaused = true;
            if (btn) btn.textContent = '▶';
        }
    });

    document.getElementById('stop-btn')?.addEventListener('click', () => {
        stopTracking(onNavigate);
    });
}

export function cleanup() {
    if (timerInterval) clearInterval(timerInterval);
    if (map) { map.remove(); map = null; }
    polyline = null;
    marker = null;
}

function initMap() {
    const mapEl = document.getElementById('tracking-map');
    if (!mapEl || typeof L === 'undefined') return;

    map = L.map(mapEl, { zoomControl: false }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    }).addTo(map);

    // Create polyline for trail
    polyline = L.polyline([], {
        color: '#A78BFA',
        weight: 4,
        opacity: 0.9,
        smoothFactor: 1,
    }).addTo(map);

    // Locate user
    map.locate({ setView: true, maxZoom: 16 });
}

function startTracking() {
    tracker = new GeoTracker(
        // onUpdate
        (point, t) => {
            const latLng = [point.latitude, point.longitude];

            // Update marker
            if (marker) {
                marker.setLatLng(latLng);
            } else if (map) {
                marker = L.circleMarker(latLng, {
                    radius: 8,
                    fillColor: '#6C5CE7',
                    fillOpacity: 1,
                    color: '#A78BFA',
                    weight: 3,
                }).addTo(map);
            }

            // Update trail
            if (polyline) {
                polyline.addLatLng(latLng);
            }

            // Pan map
            map?.setView(latLng, map.getZoom() < 14 ? 15 : map.getZoom());

            // Update HUD
            const settings = getLocalSettings();
            const speedEl = document.getElementById('live-speed');
            const distEl = document.getElementById('live-distance');

            if (speedEl) {
                const spd = settings.units === 'mi' ? t.currentSpeed * 0.621371 : t.currentSpeed;
                speedEl.textContent = spd.toFixed(1);
            }
            if (distEl) {
                const dist = settings.units === 'mi' ? t.totalDistance * 0.621371 : t.totalDistance;
                distEl.textContent = dist < 1 ? (dist * (settings.units === 'mi' ? 5280 : 1000)).toFixed(0) : dist.toFixed(2);
            }

            // Cache locally for offline resilience
            cacheTrackingSession(t.points, { mode: localStorage.getItem('justgo_mode') || 'walk' });
        },
        // onError
        (msg) => {
            console.error('GPS Error:', msg);
        }
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

    // Store result for the summary page
    const mode = localStorage.getItem('justgo_mode') || 'walk';
    sessionStorage.setItem('justgo_trip_result', JSON.stringify({
        ...result,
        mode,
    }));

    onNavigate('summary');
}
