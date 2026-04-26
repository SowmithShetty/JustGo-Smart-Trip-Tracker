/**
 * Trip Summary Page — Gradient route map, insights, final stats.
 */

import { createTrip, isAuthenticated } from '../services/api.js';
import { formatDuration, formatDistance, formatSpeed } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let map = null;

export function render(container, { onNavigate, tripData }) {
    const settings = getLocalSettings();

    // tripData can come from sessionStorage (just finished) or passed directly (from history)
    let data = tripData;
    if (!data) {
        try {
            data = JSON.parse(sessionStorage.getItem('justgo_trip_result'));
        } catch { data = null; }
    }

    if (!data || !data.points || data.points.length < 2) {
        container.innerHTML = `
            <div class="page">
                <div class="container">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <h3>No Trip Data</h3>
                        <p>Start a trip from the home screen to see your summary here.</p>
                        <button class="btn btn-primary" id="go-home-btn" style="margin-top:var(--space-lg);">Go Home</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('go-home-btn')?.addEventListener('click', () => onNavigate('home'));
        return;
    }

    // Compute local stats
    const totalDist = data.totalDistance || 0;
    const duration = data.duration || 0;
    const avgSpeed = duration > 0 ? (totalDist / (duration / 3600)) : 0;
    const speeds = data.points.map(p => p.speed_kmh || 0).filter(s => s > 0);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    // Check if we have server insights (from history) or need to compute
    const hasInsights = data.anomalies && data.anomalies.length > 0;
    const anomalies = data.anomalies || [];

    container.innerHTML = `
        <div class="page">
            <div class="container">
                <h2 style="margin-bottom:var(--space-xs);">Trip Summary</h2>
                <p class="text-secondary" style="margin-bottom:var(--space-lg);">
                    ${data.mode ? data.mode.charAt(0).toUpperCase() + data.mode.slice(1) : 'Trip'} •
                    ${new Date(data.startTime || Date.now()).toLocaleDateString()}
                </p>

                <!-- Gradient Route Map -->
                <div class="map-container glass-card" id="summary-map" style="height:350px; margin-bottom:var(--space-lg); padding:0;"></div>

                <!-- Stats Grid -->
                <div class="summary-stats" style="margin-bottom:var(--space-lg);">
                    <div class="summary-stat glass-card">
                        <div class="stat-value distance">${formatDistance(totalDist, settings.units)}</div>
                        <div class="stat-label">Total Distance</div>
                    </div>
                    <div class="summary-stat glass-card">
                        <div class="stat-value time">${formatDuration(duration)}</div>
                        <div class="stat-label">Total Time</div>
                    </div>
                    <div class="summary-stat glass-card">
                        <div class="stat-value speed">${formatSpeed(avgSpeed, settings.units)}</div>
                        <div class="stat-label">Avg Speed</div>
                    </div>
                    <div class="summary-stat glass-card">
                        <div class="stat-value" style="color:var(--danger);">${formatSpeed(maxSpeed, settings.units)}</div>
                        <div class="stat-label">Max Speed</div>
                    </div>
                </div>

                <!-- Insights Box -->
                <div id="insights-section" style="margin-bottom:var(--space-lg);">
                    <h3 style="margin-bottom:var(--space-md);">🔍 Insights</h3>
                    <div id="insights-list" class="trip-list">
                        ${anomalies.length > 0
                            ? anomalies.map(a => `
                                <div class="insight-card glass-card">
                                    <div class="insight-icon ${a.reason || 'unknown'}">
                                        ${a.reason === 'elevation' ? '⛰️' : a.reason === 'traffic' ? '🚦' : '❓'}
                                    </div>
                                    <div class="insight-text">${a.detail || 'Speed anomaly detected.'}</div>
                                </div>
                            `).join('')
                            : '<p class="text-tertiary" style="padding:var(--space-md);">Insights will appear after the trip is saved and analyzed by the server.</p>'
                        }
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="display:flex; gap:var(--space-md); justify-content:center;">
                    ${!data.id ? `
                        <button class="btn btn-primary" id="save-trip-btn">💾 Save Trip</button>
                        <button class="btn btn-secondary" id="discard-trip-btn">🗑️ Discard</button>
                    ` : `
                        <button class="btn btn-secondary" id="back-btn">← Back to History</button>
                        <button class="btn btn-danger" id="delete-trip-btn">🗑️ Delete Trip</button>
                    `}
                </div>

                <!-- Loading state for save -->
                <div id="save-loading" style="display:none; text-align:center; margin-top:var(--space-md);">
                    <div class="loading-spinner"></div>
                    <p class="text-secondary" style="margin-top:var(--space-sm);">Analyzing trip & saving…</p>
                </div>
            </div>
        </div>
    `;

    // ── Render Map ──
    renderSummaryMap(data.points);

    // ── Save Button ──
    document.getElementById('save-trip-btn')?.addEventListener('click', async () => {
        if (!isAuthenticated()) {
            window.dispatchEvent(new CustomEvent('justgo:showAuth'));
            return;
        }

        const btn = document.getElementById('save-trip-btn');
        const loading = document.getElementById('save-loading');
        if (btn) btn.style.display = 'none';
        document.getElementById('discard-trip-btn')?.style && (document.getElementById('discard-trip-btn').style.display = 'none');
        if (loading) loading.style.display = 'block';

        try {
            const tripPayload = {
                mode: data.mode || 'walk',
                started_at: data.startTime || new Date().toISOString(),
                ended_at: data.endTime || new Date().toISOString(),
                gps_points: data.points.map((p, i) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    altitude: p.altitude || 0,
                    speed_kmh: p.speed_kmh || 0,
                    recorded_at: p.recorded_at,
                    sequence_order: i,
                })),
            };

            const result = await createTrip(tripPayload);
            sessionStorage.removeItem('justgo_trip_result');

            // Show success & reload summary with server insights
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: 'Trip saved! Insights generated.', type: 'success' } }));

            // Navigate to the saved trip
            onNavigate('history');
        } catch (err) {
            if (loading) loading.style.display = 'none';
            if (btn) btn.style.display = '';
            document.getElementById('discard-trip-btn')?.style && (document.getElementById('discard-trip-btn').style.display = '');
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: err.message, type: 'error' } }));
        }
    });

    // ── Discard Button ──
    document.getElementById('discard-trip-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('justgo_trip_result');
        onNavigate('home');
    });

    // ── Back Button (from history) ──
    document.getElementById('back-btn')?.addEventListener('click', () => onNavigate('history'));

    // ── Delete Button ──
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
}

function renderSummaryMap(points) {
    const el = document.getElementById('summary-map');
    if (!el || typeof L === 'undefined' || points.length < 2) return;

    map = L.map(el, { zoomControl: false }).setView([points[0].latitude, points[0].longitude], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO',
        maxZoom: 19,
    }).addTo(map);

    // Get speed range for gradient coloring
    const speeds = points.map(p => p.speed_kmh || 0);
    const maxSpd = Math.max(...speeds, 1);

    // Draw gradient-colored segments
    for (let i = 1; i < points.length; i++) {
        const spd = points[i].speed_kmh || 0;
        const ratio = spd / maxSpd;
        const color = speedToColor(ratio);

        L.polyline(
            [[points[i-1].latitude, points[i-1].longitude],
             [points[i].latitude, points[i].longitude]],
            { color, weight: 5, opacity: 0.85 }
        ).addTo(map);
    }

    // Start marker
    L.circleMarker([points[0].latitude, points[0].longitude], {
        radius: 6, fillColor: '#34D399', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('Start');

    // End marker
    const last = points[points.length - 1];
    L.circleMarker([last.latitude, last.longitude], {
        radius: 6, fillColor: '#F87171', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('End');

    // Fit bounds
    const bounds = points.map(p => [p.latitude, p.longitude]);
    map.fitBounds(bounds, { padding: [30, 30] });
}

/** Map speed ratio (0-1) to color gradient: Red → Yellow → Green */
function speedToColor(ratio) {
    if (ratio < 0.33) {
        // Red to Yellow
        const r = 239;
        const g = Math.round(68 + (ratio / 0.33) * (187));
        return `rgb(${r}, ${g}, 68)`;
    } else if (ratio < 0.66) {
        // Yellow to Green
        const r = Math.round(239 - ((ratio - 0.33) / 0.33) * 187);
        const g = 255;
        return `rgb(${r}, ${g}, 68)`;
    } else {
        // Green
        return `rgb(52, 211, 153)`;
    }
}
