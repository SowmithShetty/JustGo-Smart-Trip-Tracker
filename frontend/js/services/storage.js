/**
 * Storage Service — LocalStorage abstraction for offline GPS caching.
 */

const STORAGE_PREFIX = 'justgo_';

/** Save an active tracking session locally (offline resilience) */
export function cacheTrackingSession(points, metadata = {}) {
    const session = {
        points,
        metadata,
        cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}active_session`, JSON.stringify(session));
}

/** Get cached tracking session */
export function getCachedSession() {
    try {
        const data = localStorage.getItem(`${STORAGE_PREFIX}active_session`);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

/** Clear cached session */
export function clearCachedSession() {
    localStorage.removeItem(`${STORAGE_PREFIX}active_session`);
}

/** Save pending trip for upload when back online */
export function addPendingTrip(tripData) {
    const pending = getPendingTrips();
    pending.push({ ...tripData, queuedAt: new Date().toISOString() });
    localStorage.setItem(`${STORAGE_PREFIX}pending_trips`, JSON.stringify(pending));
}

/** Get all pending trips */
export function getPendingTrips() {
    try {
        const data = localStorage.getItem(`${STORAGE_PREFIX}pending_trips`);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

/** Remove a pending trip after successful upload */
export function removePendingTrip(index) {
    const pending = getPendingTrips();
    pending.splice(index, 1);
    localStorage.setItem(`${STORAGE_PREFIX}pending_trips`, JSON.stringify(pending));
}

/** Get user settings from local storage */
export function getLocalSettings() {
    try {
        const data = localStorage.getItem(`${STORAGE_PREFIX}settings`);
        return data ? JSON.parse(data) : { units: 'km', theme: 'dark' };
    } catch { return { units: 'km', theme: 'dark' }; }
}

/** Save settings locally */
export function saveLocalSettings(settings) {
    const current = getLocalSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(merged));
    return merged;
}
