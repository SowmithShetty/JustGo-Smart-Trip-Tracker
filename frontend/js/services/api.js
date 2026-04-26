/**
 * API Service — HTTP client wrapper for the JustGo backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Get stored JWT token */
function getToken() {
    return localStorage.getItem('justgo_token');
}

/** Set JWT token */
export function setToken(token) {
    localStorage.setItem('justgo_token', token);
}

/** Clear auth data */
export function clearAuth() {
    localStorage.removeItem('justgo_token');
    localStorage.removeItem('justgo_user');
}

/** Get stored user */
export function getUser() {
    try {
        return JSON.parse(localStorage.getItem('justgo_user'));
    } catch { return null; }
}

/** Set user data */
export function setUser(user) {
    localStorage.setItem('justgo_user', JSON.stringify(user));
}

/** Check if user is authenticated */
export function isAuthenticated() {
    return !!getToken();
}

/** Build headers */
function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

/** Generic API call */
async function apiCall(method, path, body = null) {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);

    try {
        const resp = await fetch(`${API_BASE}${path}`, opts);
        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.detail || `API Error ${resp.status}`);
        }
        return data;
    } catch (err) {
        if (err.message === 'Failed to fetch') {
            throw new Error('Cannot connect to server. Is the backend running?');
        }
        throw err;
    }
}

// ── Auth Endpoints ────────────────────────────────────

export async function register(username, email, password) {
    const data = await apiCall('POST', '/api/auth/register', { username, email, password });
    setToken(data.access_token);
    setUser(data.user);
    return data;
}

export async function login(email, password) {
    const data = await apiCall('POST', '/api/auth/login', { email, password });
    setToken(data.access_token);
    setUser(data.user);
    return data;
}

export async function getMe() {
    return apiCall('GET', '/api/auth/me');
}

// ── Trip Endpoints ────────────────────────────────────

export async function createTrip(tripData) {
    return apiCall('POST', '/api/trips', tripData);
}

export async function listTrips() {
    return apiCall('GET', '/api/trips');
}

export async function getTrip(id) {
    return apiCall('GET', `/api/trips/${id}`);
}

export async function deleteTrip(id) {
    return apiCall('DELETE', `/api/trips/${id}`);
}

// ── User Endpoints ────────────────────────────────────

export async function updateSettings(settings) {
    const data = await apiCall('PUT', '/api/users/settings', settings);
    setUser(data);
    return data;
}
