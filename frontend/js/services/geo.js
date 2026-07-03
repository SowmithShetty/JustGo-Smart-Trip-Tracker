/**
 * Geolocation Service — GPS tracking, Haversine formula, speed calc.
 */

/** Haversine distance between two lat/lon points, returns km */
export function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) { return deg * (Math.PI / 180); }

/** Calculate speed (km/h) between two timed points */
export function calcSpeed(p1, p2) {
    const dist = haversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    const dt = (new Date(p2.recorded_at) - new Date(p1.recorded_at)) / 3600000; // hours
    return dt > 0 ? dist / dt : 0;
}

/** Format duration seconds as HH:MM:SS */
export function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format distance with appropriate units */
export function formatDistance(km, units = 'km') {
    if (units === 'mi') {
        const mi = km * 0.621371;
        return mi < 0.1 ? `${(mi * 5280).toFixed(0)} ft` : `${mi.toFixed(2)} mi`;
    }
    return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
}

/** Format speed */
export function formatSpeed(kmh, units = 'km') {
    if (units === 'mi') return `${(kmh * 0.621371).toFixed(1)} mph`;
    return `${kmh.toFixed(1)} km/h`;
}

/**
 * GeoTracker class — manages GPS tracking session.
 *
 * @param {Function} onUpdate - Callback on each valid GPS point
 * @param {Function} onError  - Callback on GPS errors
 * @param {string}   mode     - Travel mode: 'walk' | 'run' | 'drive'
 */

// Mode-specific jitter thresholds (in km).
// Walk needs a very small threshold because consecutive GPS readings
// at walking speed are often < 2m apart — the old 2m blanket filter
// silently discarded nearly every point during a walk.
const JITTER_THRESHOLDS = {
    walk: 0.0005,   // 0.5 m — walking is slow; even half-metre moves are real
    run: 0.0015,   // 1.5 m
    drive: 0.003,    // 3.0 m — cars move fast; small jumps are noise
};

// Steps per km by mode (based on average stride length).
// Walk: avg stride ~0.762 m → 1312 steps/km
// Run:  avg stride ~0.914 m → 1094 steps/km
// Drive: N/A (no step counting)
const STEPS_PER_KM = {
    walk: 1312,
    run: 1094,
};

export class GeoTracker {
    constructor(onUpdate, onError, mode = 'walk') {
        this.onUpdate = onUpdate;
        this.onError = onError;
        this.mode = mode;
        this.jitterThreshold = JITTER_THRESHOLDS[mode] ?? JITTER_THRESHOLDS.walk;
        this.watchId = null;
        this.points = [];
        this.startTime = null;
        this.paused = false;
        this.pausedAt = null;        // timestamp when pause began
        this.totalPausedMs = 0;      // accumulated paused milliseconds
        this.totalDistance = 0;
        this.currentSpeed = 0;
        this.stepCount = 0;          // estimated step count (walk/run only)
        this.stepsPerKm = STEPS_PER_KM[mode] || 0;
    }

    start() {
        if (!navigator.geolocation) {
            this.onError?.('Geolocation not supported by your browser.');
            return false;
        }

        this.startTime = new Date();
        this.points = [];
        this.totalDistance = 0;
        this.currentSpeed = 0;
        this.stepCount = 0;
        this.totalPausedMs = 0;
        this.pausedAt = null;

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this._handlePosition(pos),
            (err) => this._handleError(err),
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 10000,
            }
        );

        return true;
    }

    pause() {
        if (!this.paused) {
            this.paused = true;
            this.pausedAt = Date.now();
        }
    }

    resume() {
        if (this.paused && this.pausedAt) {
            this.totalPausedMs += Date.now() - this.pausedAt;
            this.pausedAt = null;
        }
        this.paused = false;
    }

    stop() {
        // If stopping while paused, account for the remaining pause duration
        if (this.paused && this.pausedAt) {
            this.totalPausedMs += Date.now() - this.pausedAt;
            this.pausedAt = null;
        }
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        return {
            points: this.points,
            totalDistance: this.totalDistance,
            duration: this.getElapsed(),
            startTime: this.startTime?.toISOString(),
            endTime: new Date().toISOString(),
            stepCount: this.stepCount,
        };
    }

    getElapsed() {
        if (!this.startTime) return 0;
        const now = this.paused && this.pausedAt ? this.pausedAt : Date.now();
        return Math.floor((now - this.startTime.getTime() - this.totalPausedMs) / 1000);
    }

    _handlePosition(pos) {
        if (this.paused) return;

        const point = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude || 0,
            speed_kmh: pos.coords.speed ? pos.coords.speed * 3.6 : 0,
            recorded_at: new Date().toISOString(),
            sequence_order: this.points.length,
        };

        // Calculate distance from last point
        if (this.points.length > 0) {
            const prev = this.points[this.points.length - 1];
            const dist = haversine(prev.latitude, prev.longitude, point.latitude, point.longitude);

            // Filter out GPS jitter — threshold is mode-aware
            if (dist < this.jitterThreshold) return;

            this.totalDistance += dist;
            this.currentSpeed = calcSpeed(prev, point);
            point.speed_kmh = this.currentSpeed;

            // Increment step count for walk/run modes
            if (this.stepsPerKm > 0) {
                this.stepCount += Math.round(dist * this.stepsPerKm);
            }
        }

        this.points.push(point);
        this.onUpdate?.(point, this);
    }

    _handleError(err) {
        const messages = {
            1: 'Location permission denied. Please enable location access.',
            2: 'Position unavailable. Check your GPS signal.',
            3: 'Location request timed out.',
        };
        this.onError?.(messages[err.code] || 'Unknown location error.');
    }
}

/** Check GPS availability */
export function checkGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ available: false, status: 'unsupported' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            () => resolve({ available: true, status: 'active' }),
            () => resolve({ available: false, status: 'denied' }),
            { timeout: 5000 }
        );
    });
}
