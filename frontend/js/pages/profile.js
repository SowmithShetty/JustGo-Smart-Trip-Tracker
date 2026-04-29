/**
 * Profile & Settings Page — Futuristic user hub.
 */

import { isAuthenticated, getUser, clearAuth, updateSettings } from '../services/api.js';
import { getLocalSettings, saveLocalSettings } from '../services/storage.js';

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const user     = getUser();
    const loggedIn = isAuthenticated();

    const initials = user?.username?.charAt(0)?.toUpperCase() || '?';

    container.innerHTML = `
        <div class="page">
            <div class="container" style="max-width:600px;">

                <!-- Page Header -->
                <div style="margin-bottom:var(--space-xl);">
                    <p class="cyber-font" style="font-size:0.65rem; letter-spacing:0.2em; color:var(--neon-cyan); margin-bottom:6px; text-transform:uppercase;">◈ User Console</p>
                    <h2>Your <span class="text-gradient">Profile</span></h2>
                </div>

                <!-- Profile Card -->
                ${loggedIn && user ? `
                    <div class="glass-card" style="text-align:center; margin-bottom:var(--space-xl); padding:var(--space-2xl) var(--space-lg);">
                        <div class="profile-avatar">${initials}</div>
                        <h3 style="margin-bottom:4px;">${user.username || 'User'}</h3>
                        <p class="text-secondary" style="font-size:0.875rem; margin-bottom:var(--space-xs);">${user.email || ''}</p>
                        <p class="cyber-font text-tertiary" style="font-size:0.65rem; letter-spacing:0.1em; text-transform:uppercase;">
                            Member since ${new Date(user.created_at).toLocaleDateString('en-US', { month:'long', year:'numeric' })}
                        </p>
                    </div>
                ` : `
                    <div class="glass-card" style="text-align:center; margin-bottom:var(--space-xl); padding:var(--space-2xl) var(--space-lg);">
                        <div style="font-size:3.5rem; margin-bottom:var(--space-md); filter:drop-shadow(0 0 20px var(--accent));">👤</div>
                        <h3 style="margin-bottom:var(--space-sm);">Not Signed In</h3>
                        <p class="text-secondary" style="margin-bottom:var(--space-lg); font-size:0.9rem;">Sign in to sync your trips across all devices.</p>
                        <button class="btn btn-primary" id="profile-login-btn" style="min-width:180px;">Sign In / Register</button>
                    </div>
                `}

                <!-- Preferences -->
                <div style="margin-bottom:var(--space-xl);">
                    <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                        <span style="font-size:1rem;">⚙️</span>
                        <h3>Preferences</h3>
                        <div style="flex:1; height:1px; background:linear-gradient(90deg,var(--border-color),transparent);"></div>
                    </div>
                    <div class="settings-group">
                        <!-- Units -->
                        <div class="settings-row">
                            <div>
                                <div class="settings-label">Distance Units</div>
                                <div class="settings-desc">km · metric / mi · imperial</div>
                            </div>
                            <div class="mode-toggle" id="units-toggle" style="min-width:auto;">
                                <button class="mode-option ${settings.units === 'km' ? 'active' : ''}" data-unit="km">km</button>
                                <button class="mode-option ${settings.units === 'mi' ? 'active' : ''}" data-unit="mi">mi</button>
                            </div>
                        </div>

                        <!-- Theme -->
                        <div class="settings-row">
                            <div>
                                <div class="settings-label">Dark Mode</div>
                                <div class="settings-desc">Toggle between light and dark UI</div>
                            </div>
                            <div class="toggle-switch ${settings.theme === 'dark' ? 'active' : ''}" id="theme-toggle"></div>
                        </div>
                    </div>
                </div>

                <!-- Privacy -->
                <div style="margin-bottom:var(--space-xl);">
                    <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                        <span style="font-size:1rem;">🔒</span>
                        <h3>Privacy</h3>
                        <div style="flex:1; height:1px; background:linear-gradient(90deg,var(--border-color),transparent);"></div>
                    </div>
                    <div class="settings-group">
                        <div class="settings-row">
                            <div>
                                <div class="settings-label">Location Permissions</div>
                                <div class="settings-desc">Managed by your browser settings</div>
                            </div>
                            <button class="btn btn-secondary" id="check-location-btn" style="font-size:0.8rem; padding:8px 16px;">Check</button>
                        </div>
                        <div class="settings-row">
                            <div>
                                <div class="settings-label">Clear Local Data</div>
                                <div class="settings-desc">Remove all cached tracking data</div>
                            </div>
                            <button class="btn btn-ghost" id="clear-cache-btn" style="font-size:0.8rem; color:var(--neon-magenta); padding:8px 16px;">Clear</button>
                        </div>
                    </div>
                </div>

                ${loggedIn ? `
                    <!-- Logout -->
                    <button class="btn btn-danger btn-full" id="logout-btn" style="margin-bottom:var(--space-lg);">
                        🚪 &nbsp;Sign Out
                    </button>
                ` : ''}

                <!-- App Info -->
                <div style="text-align:center; padding:var(--space-lg);">
                    <div style="width:40px; height:1px; background:var(--gradient-accent); margin:0 auto var(--space-md); opacity:0.5;"></div>
                    <p class="cyber-font text-tertiary" style="font-size:0.65rem; letter-spacing:0.1em; line-height:2;">
                        JUSTGO v1.0.0 · SMART TRIP TRACKER<br/>
                        FASTAPI · LEAFLET · THREE.JS · SUPABASE
                    </p>
                </div>

            </div>
        </div>
    `;

    document.getElementById('profile-login-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('justgo:showAuth'));
    });

    document.getElementById('units-toggle')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.mode-option');
        if (!btn) return;
        const unit = btn.dataset.unit;
        document.querySelectorAll('#units-toggle .mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveLocalSettings({ units: unit });
        if (loggedIn) { try { await updateSettings({ units: unit }); } catch {} }
    });

    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
        const toggle = document.getElementById('theme-toggle');
        const isDark = toggle.classList.contains('active');
        const newTheme = isDark ? 'light' : 'dark';
        toggle.classList.toggle('active');
        document.documentElement.setAttribute('data-theme', newTheme);
        saveLocalSettings({ theme: newTheme });
        if (loggedIn) { try { await updateSettings({ theme: newTheme }); } catch {} }
    });

    document.getElementById('check-location-btn')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            () => window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: '✅ Location access granted!', type: 'success' } })),
            () => window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: '❌ Location denied. Check browser settings.', type: 'error' } }))
        );
    });

    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
        if (confirm('Clear all cached tracking data from this device?')) {
            localStorage.removeItem('justgo_active_session');
            localStorage.removeItem('justgo_pending_trips');
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: 'Local cache cleared.', type: 'success' } }));
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        clearAuth();
        window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: 'Signed out successfully.', type: 'info' } }));
        render(container, { onNavigate });
    });
}

export function cleanup() {}
