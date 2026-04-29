/**
 * Trip History Page — Futuristic journey logbook.
 */

import { listTrips, getTrip, isAuthenticated } from '../services/api.js';
import { formatDuration, formatDistance } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let miniMaps = [];

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();

    if (!isAuthenticated()) {
        container.innerHTML = `
            <div class="page">
                <div class="container" style="max-width:600px; text-align:center; padding-top:var(--space-2xl);">
                    <div class="glass-card" style="padding:var(--space-2xl);">
                        <div style="font-size:3rem; margin-bottom:var(--space-md); filter:drop-shadow(0 0 20px var(--accent));">🔐</div>
                        <h2 class="text-gradient" style="margin-bottom:var(--space-sm);">Authentication Required</h2>
                        <p class="text-secondary" style="margin-bottom:var(--space-xl); font-size:0.9rem;">Sign in to access your full journey logbook across all your devices.</p>
                        <button class="btn btn-primary" id="login-prompt-btn" style="min-width:180px;">
                            Sign In / Register
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('login-prompt-btn')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('justgo:showAuth'));
        });
        return;
    }

    container.innerHTML = `
        <div class="page">
            <div class="container" style="max-width:760px;">
                <!-- Header -->
                <div style="margin-bottom:var(--space-xl);">
                    <p class="cyber-font" style="font-size:0.65rem; letter-spacing:0.2em; color:var(--neon-cyan); margin-bottom:6px; text-transform:uppercase;">◈ Journey Logbook</p>
                    <h2 style="margin-bottom:4px;">Trip <span class="text-gradient">History</span></h2>
                    <p class="text-secondary" style="font-size:0.875rem;">Every journey tells a story.</p>
                </div>

                <div id="trips-container">
                    <div style="text-align:center; padding:var(--space-2xl);">
                        <div class="loading-spinner"></div>
                        <p class="cyber-font text-tertiary" style="font-size:0.7rem; letter-spacing:0.15em; margin-top:var(--space-md);">LOADING TRIPS…</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadTrips(settings, onNavigate);
}

export function cleanup() {
    miniMaps.forEach(m => m.remove());
    miniMaps = [];
}

async function loadTrips(settings, onNavigate) {
    const el = document.getElementById('trips-container');
    if (!el) return;

    try {
        const trips = await listTrips();

        if (!trips || trips.length === 0) {
            el.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <h3>No Trips Yet</h3>
                    <p>Head to the home screen and start your first adventure!</p>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        trips.forEach(trip => {
            const date = new Date(trip.started_at).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(trip);
        });

        let html = '<div class="trip-list">';

        for (const [date, dayTrips] of Object.entries(grouped)) {
            // Neon date separator
            html += `
                <div style="display:flex; align-items:center; gap:var(--space-sm); margin-top:var(--space-lg); margin-bottom:var(--space-sm);">
                    <span class="cyber-font" style="font-size:0.65rem; letter-spacing:0.15em; color:var(--text-tertiary); text-transform:uppercase; white-space:nowrap;">${date}</span>
                    <div style="flex:1; height:1px; background:linear-gradient(90deg, var(--border-color), transparent);"></div>
                </div>
            `;

            dayTrips.forEach((trip, i) => {
                const modeClass = trip.mode || 'walk';
                const modeColor = modeClass === 'walk' ? 'var(--neon-cyan)' : modeClass === 'run' ? 'var(--neon-green)' : 'var(--neon-magenta)';
                const modeIcon  = modeClass === 'walk' ? '🚶' : modeClass === 'run' ? '🏃' : '🚗';

                html += `
                    <div class="trip-card glass-card" data-trip-id="${trip.id}" style="animation-delay:${i * 60}ms; animation: pageIn 0.4s ease-out both;">
                        <div class="trip-mini-map" id="mini-map-${trip.id}"></div>
                        <div class="trip-info">
                            <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:2px;">
                                <span style="font-size:1rem;">${modeIcon}</span>
                                <span style="font-weight:700; font-size:0.9rem; color:${modeColor};">${modeClass.charAt(0).toUpperCase() + modeClass.slice(1)}</span>
                            </div>
                            <div class="trip-stats">
                                <span style="color:var(--neon-green);">📏 ${formatDistance(trip.total_distance_km, settings.units)}</span>
                                <span style="color:var(--warning);">⏱ ${formatDuration(trip.duration_seconds)}</span>
                            </div>
                            <div class="trip-date">
                                ${new Date(trip.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                &nbsp;·&nbsp;
                                Avg ${settings.units === 'mi'
                                    ? (trip.avg_speed_kmh * 0.621371).toFixed(1) + ' mph'
                                    : trip.avg_speed_kmh.toFixed(1) + ' km/h'}
                            </div>
                        </div>
                        <div class="trip-mode-badge ${modeClass}">${modeClass}</div>
                    </div>
                `;
            });
        }
        html += '</div>';
        el.innerHTML = html;

        // Click handlers
        el.querySelectorAll('.trip-card').forEach(card => {
            card.addEventListener('click', async () => {
                const tripId = card.dataset.tripId;
                try {
                    const detail = await getTrip(tripId);
                    sessionStorage.setItem('justgo_trip_result', JSON.stringify({
                        id: detail.trip.id,
                        points: detail.gps_points,
                        anomalies: detail.anomalies,
                        totalDistance: detail.trip.total_distance_km,
                        duration: detail.trip.duration_seconds,
                        mode: detail.trip.mode,
                        startTime: detail.trip.started_at,
                        endTime: detail.trip.ended_at,
                    }));
                    onNavigate('summary');
                } catch (err) {
                    window.dispatchEvent(new CustomEvent('justgo:toast', {
                        detail: { message: err.message, type: 'error' }
                    }));
                }
            });
        });

        // Mini maps
        trips.slice(0, 10).forEach(trip => renderMiniMap(trip));

    } catch (err) {
        el.innerHTML = `
            <div class="empty-state">
                <h3 style="color:var(--neon-magenta);">Error Loading Trips</h3>
                <p class="text-secondary">${err.message}</p>
            </div>
        `;
    }
}

async function renderMiniMap(trip) {
    const el = document.getElementById(`mini-map-${trip.id}`);
    if (!el || typeof L === 'undefined') return;
    try {
        const detail = await getTrip(trip.id);
        const points = detail.gps_points;
        if (points.length < 2) {
            el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><span style="font-size:1.2rem;">📍</span></div>';
            return;
        }
        const m = L.map(el, {
            zoomControl: false, attributionControl: false,
            dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, touchZoom: false,
        }).setView([points[0].latitude, points[0].longitude], 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(m);
        const latlngs = points.map(p => [p.latitude, p.longitude]);
        L.polyline(latlngs, { color: '#A78BFA', weight: 2.5, opacity: 0.9 }).addTo(m);
        m.fitBounds(latlngs, { padding: [5, 5] });
        miniMaps.push(m);
    } catch {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.2rem;">🗺️</div>';
    }
}
