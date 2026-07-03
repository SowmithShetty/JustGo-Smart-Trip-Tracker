/**
 * API Service — HTTP client wrapper for the JustGo backend.
 *
 * In development:  Requests go through Vite proxy (/api → localhost:8000)
 * In production:   Requests go directly to the Render backend URL
 *
 * Features:
 * - 45s timeout to handle Render free-tier cold starts
 * - 3 progressive retries with exponential back-off
 * - Server pre-warming via /api/wake
 * - Status callbacks for UI feedback during cold starts
 */

// Smart API_BASE:
// - In dev (Vite), VITE_API_URL is empty string → requests use relative paths → Vite proxy handles them
// - In prod, VITE_API_URL is set to the Render backend URL → requests go directly there
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Retry / Timeout Config ──────────────────────────
const REQUEST_TIMEOUT_MS = 45000;   // 45s — enough for Render cold start + Supabase wake
const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 5000, 8000]; // Progressive back-off between retries

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

// ── Status callback for UI feedback ─────────────────
// Components can subscribe to status updates during API calls
let _statusCallback = null;

/**
 * Set a callback that receives status messages during long API calls.
 * @param {Function|null} cb - Receives (message: string, phase: 'connecting'|'retrying'|'success'|'error')
 */
export function setStatusCallback(cb) {
    _statusCallback = cb;
}

function emitStatus(message, phase = 'connecting') {
    if (_statusCallback) _statusCallback(message, phase);
}

// ── Server Pre-warming ──────────────────────────────

let _wakePromise = null;
let _lastWakeTime = 0;
const WAKE_COOLDOWN_MS = 60000; // Don't re-wake within 60s

/**
 * Pre-warm the Render server by calling the lightweight /api/wake endpoint.
 * This ensures the server is awake before making auth requests.
 * Returns true if server responded, false if it timed out.
 */
export async function wakeServer() {
    const now = Date.now();

    // If we woke the server recently, skip
    if (now - _lastWakeTime < WAKE_COOLDOWN_MS) {
        return true;
    }

    // If there's already a wake in progress, reuse it
    if (_wakePromise) return _wakePromise;

    _wakePromise = (async () => {
        emitStatus('Waking up server…', 'connecting');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const resp = await fetch(`${API_BASE}/api/wake`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
                const data = await resp.json();
                _lastWakeTime = Date.now();
                if (data.db === 'connecting') {
                    emitStatus('Server awake, database connecting…', 'connecting');
                    // Give the DB a moment to connect
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    emitStatus('Server ready', 'connecting');
                }
                return true;
            }
            return false;
        } catch {
            clearTimeout(timeoutId);
            return false;
        } finally {
            _wakePromise = null;
        }
    })();

    return _wakePromise;
}

// ── Core API Call ───────────────────────────────────

/**
 * Generic API call with error handling, timeout, and progressive retry.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. /api/auth/register)
 * @param {object|null} body - Request body
 * @param {number} _attempt - Current attempt number (internal)
 */
async function apiCall(method, path, body = null, _attempt = 0) {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);

    // Timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    opts.signal = controller.signal;

    try {
        const resp = await fetch(`${API_BASE}${path}`, opts);
        clearTimeout(timeoutId);

        // Handle 503 — Database temporarily unavailable (Supabase waking up)
        if (resp.status === 503 && _attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[_attempt] || 5000;
            emitStatus(
                _attempt === 0
                    ? 'Database is waking up…'
                    : `Still connecting to database (attempt ${_attempt + 1}/${MAX_RETRIES})…`,
                'retrying'
            );
            await new Promise(r => setTimeout(r, delay));
            return apiCall(method, path, body, _attempt + 1);
        }

        // Handle 401 — token expired or invalid
        if (resp.status === 401) {
            clearAuth();
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.detail || 'Session expired. Please sign in again.');
        }

        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.detail || `API Error ${resp.status}`);
        }

        emitStatus('', 'success');
        return data;

    } catch (err) {
        clearTimeout(timeoutId);

        // Retry on network errors (server still waking up)
        if ((err.name === 'AbortError' || err.message === 'Failed to fetch') && _attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[_attempt] || 5000;
            const retryNum = _attempt + 1;
            if (err.name === 'AbortError') {
                emitStatus(`Server is starting up… retry ${retryNum}/${MAX_RETRIES}`, 'retrying');
            } else {
                emitStatus(`Connecting to server… retry ${retryNum}/${MAX_RETRIES}`, 'retrying');
            }
            await new Promise(r => setTimeout(r, delay));
            return apiCall(method, path, body, _attempt + 1);
        }

        // Final failure — give a clear message
        if (err.name === 'AbortError') {
            emitStatus('', 'error');
            throw new Error('Request timed out. The server may be waking up — please try again in a moment.');
        }
        if (err.message === 'Failed to fetch') {
            emitStatus('', 'error');
            throw new Error('Cannot connect to server. Please check your internet connection and try again.');
        }

        emitStatus('', 'error');
        throw err;
    }
}

// ── Auth Endpoints ────────────────────────────────────

export async function register(username, email, password) {
    // Pre-warm the server before registration
    await wakeServer();
    emitStatus('Creating your account…', 'connecting');
    const data = await apiCall('POST', '/api/auth/register', { username, email, password });
    setToken(data.access_token);
    setUser(data.user);
    emitStatus('', 'success');
    return data.user;
}

export async function googleLogin(credential) {
    await wakeServer();
    emitStatus('Signing in with Google…', 'connecting');
    const data = await apiCall('POST', '/api/auth/google', { credential });
    setToken(data.access_token);
    setUser(data.user);
    emitStatus('', 'success');
    return data.user;
}

export async function login(email, password) {
    // Pre-warm the server before login
    await wakeServer();
    emitStatus('Signing you in…', 'connecting');
    const data = await apiCall('POST', '/api/auth/login', { email, password });
    setToken(data.access_token);
    setUser(data.user);
    emitStatus('', 'success');
    return data.user;
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

// ── AI Coach Endpoints ────────────────────────────────

export async function getAICoaching(tripId) {
    return apiCall('GET', `/api/ai/coach/${tripId}`);
}

export async function analyzeTrip(tripData) {
    await wakeServer();
    return apiCall('POST', '/api/ai/analyze', tripData);
}
