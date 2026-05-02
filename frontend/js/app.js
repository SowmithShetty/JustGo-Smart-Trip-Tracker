/**
 * JustGo — Main Application (SPA Router, Auth, Toast System)
 */

import * as homePage from './pages/home.js';
import * as trackingPage from './pages/tracking.js';
import * as summaryPage from './pages/summary.js';
import * as historyPage from './pages/history.js';
import * as profilePage from './pages/profile.js';
import { isAuthenticated, register, login, getUser, getMe, setUser, clearAuth } from './services/api.js';
import { getLocalSettings } from './services/storage.js';

// ── Page Registry ──────────────────────────────────────

const pages = {
    home: homePage,
    tracking: trackingPage,
    summary: summaryPage,
    history: historyPage,
    profile: profilePage,
};

let currentPage = null;

// ── Router ─────────────────────────────────────────────

function getRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const route = hash.replace('/', '') || 'home';
    return route;
}

function navigate(page) {
    window.location.hash = `#/${page}`;
}

function renderPage(route) {
    const container = document.getElementById('app-content');
    if (!container) return;

    // Cleanup previous page
    if (currentPage && pages[currentPage]?.cleanup) {
        pages[currentPage].cleanup();
    }

    // Get page module
    const page = pages[route];
    if (!page) {
        container.innerHTML = `<div class="page"><div class="container"><h2>Page Not Found</h2></div></div>`;
        return;
    }

    // Render
    currentPage = route;
    page.render(container, { onNavigate: navigate });

    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === route);
    });
}

// ── Auth Validation Helpers ────────────────────────────

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateUsername(username) {
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function getPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    if (score <= 2) return { level: 'weak', percent: 25, color: 'var(--neon-magenta)' };
    if (score <= 4) return { level: 'medium', percent: 55, color: 'var(--warning)' };
    return { level: 'strong', percent: 100, color: 'var(--neon-green)' };
}

function validatePassword(password) {
    const errors = [];
    if (password.length < 8) errors.push('At least 8 characters');
    if (!/[A-Za-z]/.test(password)) errors.push('At least one letter');
    if (!/[0-9]/.test(password)) errors.push('At least one number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('At least one special character');
    return errors;
}

function showFieldError(fieldId, message) {
    const el = document.getElementById(fieldId);
    if (el) {
        el.textContent = message;
        el.style.display = message ? 'block' : 'none';
    }
    // Add error class to the input
    const inputId = fieldId.replace('-error', '');
    const input = document.getElementById(inputId);
    if (input) {
        input.classList.toggle('input-error', !!message);
        input.classList.toggle('input-valid', !message && input.value.length > 0);
    }
}

function clearAllFieldErrors() {
    ['auth-username-error', 'auth-email-error', 'auth-password-error', 'auth-confirm-error'].forEach(id => {
        showFieldError(id, '');
    });
    const banner = document.getElementById('auth-error-banner');
    if (banner) banner.style.display = 'none';
}

function showAuthError(message) {
    const banner = document.getElementById('auth-error-banner');
    if (banner) {
        banner.textContent = message;
        banner.style.display = 'block';
        // Auto-hide after 5s
        setTimeout(() => { if (banner) banner.style.display = 'none'; }, 5000);
    }
}

// ── Auth Modal ─────────────────────────────────────────

let isRegisterMode = true;

function showAuthModal() {
    document.getElementById('auth-modal').style.display = '';
    isRegisterMode = true;
    updateAuthMode();
    clearAllFieldErrors();
    // Reset form
    document.getElementById('auth-form')?.reset();
    updatePasswordStrength('');
}

function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
    clearAllFieldErrors();
}

function updateAuthMode() {
    const title = document.getElementById('auth-modal-title');
    const usernameGroup = document.getElementById('auth-username-group');
    const confirmGroup = document.getElementById('auth-confirm-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');
    const strengthContainer = document.getElementById('password-strength-container');
    const passwordHint = document.getElementById('password-requirements');

    if (isRegisterMode) {
        if (title) title.textContent = 'Create Account';
        if (usernameGroup) usernameGroup.style.display = '';
        if (confirmGroup) confirmGroup.style.display = '';
        if (submitBtn) submitBtn.textContent = 'Create Account';
        if (toggleText) toggleText.textContent = 'Already have an account?';
        if (toggleLink) toggleLink.textContent = 'Sign In';
        if (passwordHint) passwordHint.style.display = '';
    } else {
        if (title) title.textContent = 'Welcome Back';
        if (usernameGroup) usernameGroup.style.display = 'none';
        if (confirmGroup) confirmGroup.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Sign In';
        if (toggleText) toggleText.textContent = "Don't have an account?";
        if (toggleLink) toggleLink.textContent = 'Create One';
        if (strengthContainer) strengthContainer.style.display = 'none';
        if (passwordHint) passwordHint.style.display = 'none';
    }

    clearAllFieldErrors();
}

function updatePasswordStrength(password) {
    const container = document.getElementById('password-strength-container');
    const fill = document.getElementById('password-strength-fill');
    const label = document.getElementById('password-strength-label');

    if (!container || !fill || !label) return;

    if (!password || !isRegisterMode) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    const strength = getPasswordStrength(password);
    fill.style.width = strength.percent + '%';
    fill.style.background = strength.color;
    fill.style.boxShadow = `0 0 8px ${strength.color}`;
    label.textContent = strength.level.charAt(0).toUpperCase() + strength.level.slice(1);
    label.style.color = strength.color;
}

function setupPasswordToggles() {
    // Main password toggle
    document.getElementById('password-toggle')?.addEventListener('click', () => {
        togglePasswordVisibility('auth-password', 'password-toggle');
    });

    // Confirm password toggle
    document.getElementById('confirm-password-toggle')?.addEventListener('click', () => {
        togglePasswordVisibility('auth-confirm-password', 'confirm-password-toggle');
    });
}

function togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    const eyeIcon = toggle.querySelector('.eye-icon');
    const eyeOffIcon = toggle.querySelector('.eye-off-icon');
    if (eyeIcon) eyeIcon.style.display = isPassword ? 'none' : '';
    if (eyeOffIcon) eyeOffIcon.style.display = isPassword ? '' : 'none';
}

function initAuth() {
    // Toggle link
    document.getElementById('auth-toggle-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        updateAuthMode();
    });

    // Password strength meter (live updates)
    document.getElementById('auth-password')?.addEventListener('input', (e) => {
        updatePasswordStrength(e.target.value);
        // Live validation feedback
        if (isRegisterMode && e.target.value.length > 0) {
            const errors = validatePassword(e.target.value);
            if (errors.length > 0) {
                showFieldError('auth-password-error', errors[0]);
            } else {
                showFieldError('auth-password-error', '');
            }
        }
    });

    // Live confirm password matching
    document.getElementById('auth-confirm-password')?.addEventListener('input', (e) => {
        const password = document.getElementById('auth-password')?.value;
        if (e.target.value && password !== e.target.value) {
            showFieldError('auth-confirm-error', 'Passwords do not match');
        } else {
            showFieldError('auth-confirm-error', '');
        }
    });

    // Live email validation
    document.getElementById('auth-email')?.addEventListener('blur', (e) => {
        if (e.target.value && !validateEmail(e.target.value)) {
            showFieldError('auth-email-error', 'Please enter a valid email address');
        } else {
            showFieldError('auth-email-error', '');
        }
    });

    // Live username validation
    document.getElementById('auth-username')?.addEventListener('blur', (e) => {
        if (isRegisterMode && e.target.value && !validateUsername(e.target.value)) {
            showFieldError('auth-username-error', 'Letters, numbers, and underscores only (3–30 chars)');
        } else {
            showFieldError('auth-username-error', '');
        }
    });

    // Password toggle buttons
    setupPasswordToggles();

    // Form submit
    document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAllFieldErrors();

        const btn = document.getElementById('auth-submit-btn');
        const email = document.getElementById('auth-email')?.value?.trim();
        const password = document.getElementById('auth-password')?.value;
        const username = document.getElementById('auth-username')?.value?.trim();
        const confirmPassword = document.getElementById('auth-confirm-password')?.value;

        // ── Client-side Validation ──

        let hasError = false;

        // Email validation
        if (!email) {
            showFieldError('auth-email-error', 'Email is required');
            hasError = true;
        } else if (!validateEmail(email)) {
            showFieldError('auth-email-error', 'Please enter a valid email address');
            hasError = true;
        }

        // Password validation
        if (!password) {
            showFieldError('auth-password-error', 'Password is required');
            hasError = true;
        } else if (isRegisterMode) {
            const pwErrors = validatePassword(password);
            if (pwErrors.length > 0) {
                showFieldError('auth-password-error', pwErrors[0]);
                hasError = true;
            }
        }

        if (isRegisterMode) {
            // Username validation
            if (!username) {
                showFieldError('auth-username-error', 'Username is required');
                hasError = true;
            } else if (!validateUsername(username)) {
                showFieldError('auth-username-error', 'Letters, numbers, and underscores only (3–30 chars)');
                hasError = true;
            }

            // Confirm password
            if (!confirmPassword) {
                showFieldError('auth-confirm-error', 'Please confirm your password');
                hasError = true;
            } else if (password !== confirmPassword) {
                showFieldError('auth-confirm-error', 'Passwords do not match');
                hasError = true;
            }
        }

        if (hasError) return;

        // ── Submit ──

        if (btn) btn.textContent = 'Loading…';
        if (btn) btn.disabled = true;

        try {
            if (isRegisterMode) {
                await register(username, email, password);
            } else {
                await login(email, password);
            }
            hideAuthModal();
            showToast('Welcome to JustGo! 🎉', 'success');

            // Dispatch auth complete event so pending actions can retry
            window.dispatchEvent(new CustomEvent('justgo:authComplete'));

            renderPage(getRoute()); // Re-render current page
        } catch (err) {
            showAuthError(err.message);
        } finally {
            if (btn) btn.disabled = false;
            updateAuthMode();
        }
    });

    // Close on backdrop click
    document.getElementById('auth-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'auth-modal') hideAuthModal();
    });

    // Custom event to show auth
    window.addEventListener('justgo:showAuth', showAuthModal);
}

// ── Toast System ───────────────────────────────────────

function initToasts() {
    // Create toast container
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);

    window.addEventListener('justgo:toast', (e) => {
        const { message, type } = e.detail;
        showToast(message, type);
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ── Theme Initialization ───────────────────────────────

function initTheme() {
    const settings = getLocalSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
}

// ── Token Validation on Startup ────────────────────────

async function validateSession() {
    if (!isAuthenticated()) return;
    try {
        const user = await getMe();
        setUser(user);
    } catch {
        // Token is expired or invalid — clear it silently
        clearAuth();
    }
}

// ── Initialize App ─────────────────────────────────────

function init() {
    initTheme();
    initAuth();
    initToasts();

    // Validate session token on startup
    validateSession();

    // Route on hash change
    window.addEventListener('hashchange', () => {
        renderPage(getRoute());
    });

    // Initial render
    renderPage(getRoute());
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
