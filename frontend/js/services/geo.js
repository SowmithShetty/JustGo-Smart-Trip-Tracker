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
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
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
 */
export class GeoTracker {
    constructor(onUpdate, onError) {
        this.onUpdate = onUpdate;
        this.onError = onError;
        this.watchId = null;
        this.points = [];
        this.startTime = null;
        this.paused = false;
        this.totalDistance = 0;
        this.currentSpeed = 0;
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
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    stop() {
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
        };
    }

    getElapsed() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
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

            // Filter out GPS jitter (ignore jumps < 2m)
            if (dist < 0.002) return;

            this.totalDistance += dist;
            this.currentSpeed = calcSpeed(prev, point);
            point.speed_kmh = this.currentSpeed;
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
