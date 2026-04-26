/**
 * Trip History Page — Scrollable list of past trips.
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
                <div class="container">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <h3>Login Required</h3>
                        <p>Sign in to view your trip history.</p>
                        <button class="btn btn-primary" id="login-prompt-btn" style="margin-top:var(--space-lg);">Sign In</button>
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
            <div class="container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-lg);">
                    <div>
                        <h2>Trip History</h2>
                        <p class="text-secondary">Your journey logbook</p>
                    </div>
                </div>
                <div id="trips-container">
                    <div class="loading-spinner"></div>
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <h3>No Trips Yet</h3>
                    <p>Start your first trip from the home screen!</p>
                </div>
            `;
            return;
        }

        // Group trips by date
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
            html += `<p class="text-tertiary" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; margin-top:var(--space-md); margin-bottom:var(--space-sm);">${date}</p>`;
            dayTrips.forEach(trip => {
                html += `
                    <div class="trip-card glass-card" data-trip-id="${trip.id}">
                        <div class="trip-mini-map" id="mini-map-${trip.id}"></div>
                        <div class="trip-info">
                            <div class="trip-stats">
                                <span>📏 ${formatDistance(trip.total_distance_km, settings.units)}</span>
                                <span>⏱ ${formatDuration(trip.duration_seconds)}</span>
                            </div>
                            <div class="trip-date">
                                ${new Date(trip.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                — Avg ${(settings.units === 'mi' ? (trip.avg_speed_kmh * 0.621371).toFixed(1) + ' mph' : trip.avg_speed_kmh.toFixed(1) + ' km/h')}
                            </div>
                        </div>
                        <div class="trip-mode-badge">${trip.mode}</div>
                    </div>
                `;
            });
        }
        html += '</div>';
        el.innerHTML = html;

        // Add click handlers
        el.querySelectorAll('.trip-card').forEach(card => {
            card.addEventListener('click', async () => {
                const tripId = card.dataset.tripId;
                try {
                    const detail = await getTrip(tripId);
                    // Navigate to summary with full data
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

        // Render mini maps (only for visible trips, lazy)
        trips.slice(0, 10).forEach(trip => {
            renderMiniMap(trip);
        });

    } catch (err) {
        el.innerHTML = `
            <div class="empty-state">
                <h3>Error Loading Trips</h3>
                <p class="text-secondary">${err.message}</p>
            </div>
        `;
    }
}

async function renderMiniMap(trip) {
    const el = document.getElementById(`mini-map-${trip.id}`);
    if (!el || typeof L === 'undefined') return;

    try {
        // Try to get trip detail for GPS points
        const detail = await getTrip(trip.id);
        const points = detail.gps_points;

        if (points.length < 2) {
            el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><span class="text-tertiary" style="font-size:0.625rem;">No route</span></div>';
            return;
        }

        const m = L.map(el, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
        }).setView([points[0].latitude, points[0].longitude], 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(m);

        const latlngs = points.map(p => [p.latitude, p.longitude]);
        L.polyline(latlngs, { color: '#A78BFA', weight: 2, opacity: 0.8 }).addTo(m);
        m.fitBounds(latlngs, { padding: [5, 5] });

        miniMaps.push(m);
    } catch {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><span class="text-tertiary" style="font-size:0.625rem;">🗺️</span></div>';
    }
}
