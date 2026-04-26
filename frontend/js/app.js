/**
 * JustGo — Main Application (SPA Router, Auth, Toast System)
 */

import * as homePage from './pages/home.js';
import * as trackingPage from './pages/tracking.js';
import * as summaryPage from './pages/summary.js';
import * as historyPage from './pages/history.js';
import * as profilePage from './pages/profile.js';
import { isAuthenticated, register, login, getUser } from './services/api.js';
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

// ── Auth Modal ─────────────────────────────────────────

let isRegisterMode = true;

function showAuthModal() {
    document.getElementById('auth-modal').style.display = '';
    isRegisterMode = true;
    updateAuthMode();
}

function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function updateAuthMode() {
    const title = document.getElementById('auth-modal-title');
    const usernameGroup = document.getElementById('auth-username-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');

    if (isRegisterMode) {
        if (title) title.textContent = 'Create Account';
        if (usernameGroup) usernameGroup.style.display = '';
        if (submitBtn) submitBtn.textContent = 'Create Account';
        if (toggleText) toggleText.textContent = 'Already have an account?';
        if (toggleLink) toggleLink.textContent = 'Sign In';
    } else {
        if (title) title.textContent = 'Welcome Back';
        if (usernameGroup) usernameGroup.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Sign In';
        if (toggleText) toggleText.textContent = "Don't have an account?";
        if (toggleLink) toggleLink.textContent = 'Create One';
    }
}

function initAuth() {
    // Toggle link
    document.getElementById('auth-toggle-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        updateAuthMode();
    });

    // Form submit
    document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('auth-submit-btn');
        const email = document.getElementById('auth-email')?.value;
        const password = document.getElementById('auth-password')?.value;
        const username = document.getElementById('auth-username')?.value;

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
            renderPage(getRoute()); // Re-render current page
        } catch (err) {
            showToast(err.message, 'error');
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

// ── Initialize App ─────────────────────────────────────

function init() {
    initTheme();
    initAuth();
    initToasts();

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
