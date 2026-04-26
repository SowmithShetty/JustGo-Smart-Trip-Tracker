/**
 * Profile & Settings Page.
 */

import { isAuthenticated, getUser, clearAuth, updateSettings } from '../services/api.js';
import { getLocalSettings, saveLocalSettings } from '../services/storage.js';

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const user = getUser();
    const loggedIn = isAuthenticated();

    container.innerHTML = `
        <div class="page">
            <div class="container" style="max-width:600px;">
                <!-- Profile Header -->
                ${loggedIn && user ? `
                    <div class="glass-card" style="text-align:center; margin-bottom:var(--space-lg);">
                        <div class="profile-avatar">${user.username?.charAt(0)?.toUpperCase() || '?'}</div>
                        <h3>${user.username || 'User'}</h3>
                        <p class="text-secondary" style="font-size:0.875rem;">${user.email || ''}</p>
                        <p class="text-tertiary" style="font-size:0.75rem; margin-top:var(--space-xs);">
                            Member since ${new Date(user.created_at).toLocaleDateString()}
                        </p>
                    </div>
                ` : `
                    <div class="glass-card" style="text-align:center; margin-bottom:var(--space-lg);">
                        <div class="profile-avatar">?</div>
                        <h3>Not Signed In</h3>
                        <p class="text-secondary" style="margin-bottom:var(--space-md);">Sign in to sync your trips across devices.</p>
                        <button class="btn btn-primary" id="profile-login-btn">Sign In / Register</button>
                    </div>
                `}

                <!-- Preferences -->
                <h3 style="margin-bottom:var(--space-md);">⚙️ Preferences</h3>
                <div class="settings-group" style="margin-bottom:var(--space-lg);">
                    <!-- Units -->
                    <div class="settings-row">
                        <div>
                            <div class="settings-label">Distance Units</div>
                            <div class="settings-desc">Choose kilometers or miles</div>
                        </div>
                        <div class="mode-toggle" id="units-toggle" style="min-width:auto;">
                            <button class="mode-option ${settings.units === 'km' ? 'active' : ''}" data-unit="km">km</button>
                            <button class="mode-option ${settings.units === 'mi' ? 'active' : ''}" data-unit="mi">mi</button>
                        </div>
                    </div>

                    <!-- Theme -->
                    <div class="settings-row">
                        <div>
                            <div class="settings-label">Theme</div>
                            <div class="settings-desc">Switch between light and dark mode</div>
                        </div>
                        <div class="toggle-switch ${settings.theme === 'dark' ? 'active' : ''}" id="theme-toggle"></div>
                    </div>
                </div>

                <!-- Privacy -->
                <h3 style="margin-bottom:var(--space-md);">🔒 Privacy</h3>
                <div class="settings-group" style="margin-bottom:var(--space-lg);">
                    <div class="settings-row">
                        <div>
                            <div class="settings-label">Location Permissions</div>
                            <div class="settings-desc">Managed by your browser settings</div>
                        </div>
                        <button class="btn btn-ghost" id="check-location-btn" style="font-size:0.8125rem;">Check</button>
                    </div>
                    <div class="settings-row">
                        <div>
                            <div class="settings-label">Clear Local Data</div>
                            <div class="settings-desc">Remove cached tracking data from this device</div>
                        </div>
                        <button class="btn btn-ghost" id="clear-cache-btn" style="font-size:0.8125rem; color:var(--danger);">Clear</button>
                    </div>
                </div>

                ${loggedIn ? `
                    <!-- Logout -->
                    <button class="btn btn-secondary btn-full" id="logout-btn" style="margin-top:var(--space-md);">
                        🚪 Sign Out
                    </button>
                ` : ''}

                <!-- App Info -->
                <div style="text-align:center; margin-top:var(--space-2xl); padding:var(--space-lg);">
                    <p class="text-tertiary" style="font-size:0.75rem;">
                        JustGo v1.0.0 — Smart Trip Tracker<br/>
                        Built with ❤️ using FastAPI, Leaflet & Three.js
                    </p>
                </div>
            </div>
        </div>
    `;

    // ── Login Button ──
    document.getElementById('profile-login-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('justgo:showAuth'));
    });

    // ── Units Toggle ──
    document.getElementById('units-toggle')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.mode-option');
        if (!btn) return;
        const unit = btn.dataset.unit;

        document.querySelectorAll('#units-toggle .mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        saveLocalSettings({ units: unit });
        if (loggedIn) {
            try { await updateSettings({ units: unit }); } catch {}
        }
    });

    // ── Theme Toggle ──
    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
        const toggle = document.getElementById('theme-toggle');
        const isDark = toggle.classList.contains('active');
        const newTheme = isDark ? 'light' : 'dark';

        toggle.classList.toggle('active');
        document.documentElement.setAttribute('data-theme', newTheme);
        saveLocalSettings({ theme: newTheme });

        if (loggedIn) {
            try { await updateSettings({ theme: newTheme }); } catch {}
        }
    });

    // ── Check Location ──
    document.getElementById('check-location-btn')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            () => {
                window.dispatchEvent(new CustomEvent('justgo:toast', {
                    detail: { message: '✅ Location access granted!', type: 'success' }
                }));
            },
            () => {
                window.dispatchEvent(new CustomEvent('justgo:toast', {
                    detail: { message: '❌ Location access denied. Check browser settings.', type: 'error' }
                }));
            }
        );
    });

    // ── Clear Cache ──
    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
        if (confirm('Clear all cached tracking data from this device?')) {
            localStorage.removeItem('justgo_active_session');
            localStorage.removeItem('justgo_pending_trips');
            window.dispatchEvent(new CustomEvent('justgo:toast', {
                detail: { message: 'Local cache cleared.', type: 'success' }
            }));
        }
    });

    // ── Logout ──
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        clearAuth();
        window.dispatchEvent(new CustomEvent('justgo:toast', {
            detail: { message: 'Signed out successfully.', type: 'info' }
        }));
        render(container, { onNavigate });
    });
}

export function cleanup() {}
