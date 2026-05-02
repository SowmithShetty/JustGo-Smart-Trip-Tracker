/**
 * Trip Summary Page — Futuristic post-trip debrief.
 */

import { createTrip, isAuthenticated } from '../services/api.js';
import { formatDuration, formatDistance, formatSpeed } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let map = null;

export function render(container, { onNavigate, tripData }) {
    const settings = getLocalSettings();

    let data = tripData;
    if (!data) {
        try { data = JSON.parse(sessionStorage.getItem('justgo_trip_result')); }
        catch { data = null; }
    }

    if (!data || !data.points || data.points.length < 2) {
        container.innerHTML = `
            <div class="page">
                <div class="container" style="max-width:600px; text-align:center; padding-top:var(--space-2xl);">
                    <div class="glass-card" style="padding:var(--space-2xl);">
                        <div style="font-size:3rem; margin-bottom:var(--space-md);">🛸</div>
                        <h2 class="text-gradient" style="margin-bottom:var(--space-sm);">No Trip Data</h2>
                        <p class="text-secondary" style="margin-bottom:var(--space-xl);">Start a trip from the home screen to see your summary here.</p>
                        <button class="btn btn-primary" id="go-home-btn">← Go Home</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('go-home-btn')?.addEventListener('click', () => onNavigate('home'));
        return;
    }

    const totalDist = data.totalDistance || 0;
    const duration  = data.duration || 0;
    const avgSpeed  = duration > 0 ? (totalDist / (duration / 3600)) : 0;
    const speeds    = data.points.map(p => p.speed_kmh || 0).filter(s => s > 0);
    const maxSpeed  = speeds.length > 0 ? Math.max(...speeds) : 0;
    const anomalies = data.anomalies || [];

    const modeColor = data.mode === 'walk' ? 'var(--neon-cyan)' : data.mode === 'run' ? 'var(--neon-green)' : 'var(--neon-magenta)';
    const modeIcon  = data.mode === 'walk' ? '🚶' : data.mode === 'run' ? '🏃' : '🚗';

    container.innerHTML = `
        <div class="page">
            <div class="container" style="max-width:760px;">

                <!-- Header -->
                <div style="margin-bottom:var(--space-lg);">
                    <p class="cyber-font" style="font-size:0.65rem; letter-spacing:0.2em; color:${modeColor}; margin-bottom:6px; text-transform:uppercase;">
                        ◈ ${modeIcon} ${(data.mode || 'Trip').toUpperCase()} COMPLETE
                    </p>
                    <h2 style="margin-bottom:4px;">Trip <span class="text-gradient">Summary</span></h2>
                    <p class="text-secondary" style="font-size:0.875rem; font-family:var(--font-mono);">
                        ${new Date(data.startTime || Date.now()).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
                    </p>
                </div>

                <!-- Route Map -->
                <div class="glass-card" id="summary-map" style="height:360px; padding:0; margin-bottom:var(--space-lg); overflow:hidden; box-shadow:0 0 40px rgba(167,139,250,0.1);"></div>

                <!-- Metric Grid -->
                <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:var(--space-md); margin-bottom:var(--space-lg);">
                    <div class="metric-box green">
                        <div class="stat-label" style="margin-bottom:8px;">Total Distance</div>
                        <div class="stat-value distance" style="font-size:2rem;">${formatDistance(totalDist, settings.units)}</div>
                    </div>
                    <div class="metric-box purple" style="--mb-color:var(--warning);">
                        <div class="stat-label" style="margin-bottom:8px;">Duration</div>
                        <div class="stat-value time" style="font-size:2rem;">${formatDuration(duration)}</div>
                    </div>
                    <div class="metric-box cyan">
                        <div class="stat-label" style="margin-bottom:8px;">Avg Speed</div>
                        <div class="stat-value speed" style="font-size:2rem;">${formatSpeed(avgSpeed, settings.units)}</div>
                    </div>
                    <div class="metric-box magenta">
                        <div class="stat-label" style="margin-bottom:8px;">Max Speed</div>
                        <div class="stat-value" style="font-size:2rem; color:var(--neon-magenta); text-shadow:0 0 20px var(--neon-magenta-glow);">${formatSpeed(maxSpeed, settings.units)}</div>
                    </div>
                </div>

                <!-- Insights -->
                <div style="margin-bottom:var(--space-lg);">
                    <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                        <span style="font-size:1rem;">🔍</span>
                        <h3>Route <span class="text-gradient">Insights</span></h3>
                        <div style="flex:1; height:1px; background:linear-gradient(90deg,var(--border-color),transparent);"></div>
                    </div>
                    <div class="trip-list" id="insights-list">
                        ${anomalies.length > 0
                            ? anomalies.map((a, i) => `
                                <div class="insight-card glass-card" style="animation-delay:${i * 80}ms;">
                                    <div class="insight-icon ${a.reason || 'unknown'}">
                                        ${a.reason === 'elevation' ? '⛰️' : a.reason === 'traffic' ? '🚦' : '❓'}
                                    </div>
                                    <div class="insight-text">${a.detail || 'Speed anomaly detected.'}</div>
                                </div>
                            `).join('')
                            : `<div class="glass-card" style="padding:var(--space-md); text-align:center;">
                                   <p class="cyber-font text-tertiary" style="font-size:0.7rem; letter-spacing:0.1em;">
                                       Insights will appear after the trip is saved &amp; analyzed by the server.
                                   </p>
                               </div>`
                        }
                    </div>
                </div>

                <!-- Actions -->
                <div style="display:flex; gap:var(--space-md); justify-content:center; flex-wrap:wrap;">
                    ${!data.id ? `
                        <button class="btn btn-primary" id="save-trip-btn" style="min-width:160px;">💾 &nbsp;Save Trip</button>
                        <button class="btn btn-secondary" id="discard-trip-btn">🗑️ &nbsp;Discard</button>
                    ` : `
                        <button class="btn btn-secondary" id="back-btn">← &nbsp;Back to History</button>
                        <button class="btn btn-danger"    id="delete-trip-btn">🗑️ &nbsp;Delete Trip</button>
                    `}
                </div>

                <!-- Save loading -->
                <div id="save-loading" style="display:none; text-align:center; margin-top:var(--space-lg);">
                    <div class="loading-spinner"></div>
                    <p class="cyber-font text-secondary" style="margin-top:var(--space-sm); font-size:0.7rem; letter-spacing:0.1em;">ANALYZING & SAVING…</p>
                </div>
            </div>
        </div>
    `;

    renderSummaryMap(data.points);

    // ── Save Trip Handler ──
    const saveTrip = async () => {
        if (!isAuthenticated()) {
            // Mark that we want to save after auth completes
            window._justgoPendingSave = true;
            window.dispatchEvent(new CustomEvent('justgo:showAuth'));
            return;
        }
        const btn     = document.getElementById('save-trip-btn');
        const discard = document.getElementById('discard-trip-btn');
        const loading = document.getElementById('save-loading');
        if (btn) btn.style.display = 'none';
        if (discard) discard.style.display = 'none';
        if (loading) loading.style.display = 'block';

        try {
            const tripPayload = {
                mode: data.mode || 'walk',
                started_at: data.startTime || new Date().toISOString(),
                ended_at:   data.endTime   || new Date().toISOString(),
                gps_points: data.points.map((p, i) => ({
                    latitude: p.latitude, longitude: p.longitude,
                    altitude: p.altitude || 0, speed_kmh: p.speed_kmh || 0,
                    recorded_at: p.recorded_at, sequence_order: i,
                })),
            };
            await createTrip(tripPayload);
            sessionStorage.removeItem('justgo_trip_result');
            window._justgoPendingSave = false;
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: '✅ Trip saved! Insights generated.', type: 'success' } }));
            onNavigate('history');
        } catch (err) {
            if (loading) loading.style.display = 'none';
            if (btn) btn.style.display = '';
            if (discard) discard.style.display = '';
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: err.message, type: 'error' } }));
        }
    };

    document.getElementById('save-trip-btn')?.addEventListener('click', saveTrip);

    // Auto-retry save after successful authentication
    const authCompleteHandler = () => {
        if (window._justgoPendingSave) {
            saveTrip();
        }
    };
    window.addEventListener('justgo:authComplete', authCompleteHandler);
    // Store handler reference for cleanup
    window._justgoAuthHandler = authCompleteHandler;

    document.getElementById('discard-trip-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('justgo_trip_result');
        onNavigate('home');
    });

    document.getElementById('back-btn')?.addEventListener('click', () => onNavigate('history'));

    document.getElementById('delete-trip-btn')?.addEventListener('click', async () => {
        if (data.id && confirm('Delete this trip permanently?')) {
            try {
                const { deleteTrip } = await import('../services/api.js');
                await deleteTrip(data.id);
                window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: 'Trip deleted.', type: 'info' } }));
                onNavigate('history');
            } catch (err) {
                window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: err.message, type: 'error' } }));
            }
        }
    });
}

export function cleanup() {
    if (map) { map.remove(); map = null; }
    // Remove auth complete listener
    if (window._justgoAuthHandler) {
        window.removeEventListener('justgo:authComplete', window._justgoAuthHandler);
        window._justgoAuthHandler = null;
    }
    window._justgoPendingSave = false;
}

function renderSummaryMap(points) {
    const el = document.getElementById('summary-map');
    if (!el || typeof L === 'undefined' || points.length < 2) return;

    map = L.map(el, { zoomControl: false }).setView([points[0].latitude, points[0].longitude], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', maxZoom: 19,
    }).addTo(map);

    const speeds = points.map(p => p.speed_kmh || 0);
    const maxSpd = Math.max(...speeds, 1);

    for (let i = 1; i < points.length; i++) {
        const ratio = (points[i].speed_kmh || 0) / maxSpd;
        L.polyline(
            [[points[i-1].latitude, points[i-1].longitude], [points[i].latitude, points[i].longitude]],
            { color: speedToColor(ratio), weight: 6, opacity: 0.9 }
        ).addTo(map);
    }

    // Animated glow polyline
    L.polyline(points.map(p => [p.latitude, p.longitude]), {
        color: 'rgba(167,139,250,0.2)', weight: 12, opacity: 0.6,
    }).addTo(map);

    L.circleMarker([points[0].latitude, points[0].longitude], {
        radius: 8, fillColor: '#00FF87', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('Start');

    const last = points[points.length - 1];
    L.circleMarker([last.latitude, last.longitude], {
        radius: 8, fillColor: '#FF2D78', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('End');

    map.fitBounds(points.map(p => [p.latitude, p.longitude]), { padding: [30, 30] });
}

function speedToColor(ratio) {
    if (ratio < 0.33) {
        const g = Math.round(68 + (ratio / 0.33) * 187);
        return `rgb(239, ${g}, 68)`;
    } else if (ratio < 0.66) {
        const r = Math.round(239 - ((ratio - 0.33) / 0.33) * 187);
        return `rgb(${r}, 255, 68)`;
    }
    return `rgb(0, 255, 135)`;
}
