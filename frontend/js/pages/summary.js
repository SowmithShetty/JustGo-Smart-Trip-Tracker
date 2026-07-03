/**
 * Trip Summary Page — Futuristic post-trip debrief.
 *
 * Features:
 * - Route map with speed-coded gradient
 * - 3D speed visualization
 * - Step count (walk/run)
 * - AI Analysis with canvas charts + Gemini coaching
 */

import { createTrip, isAuthenticated, getAICoaching, analyzeTrip } from '../services/api.js';
import { formatDuration, formatDistance, formatSpeed } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let map = null;

// Step estimation constants (match geo.js)
const STEPS_PER_KM = { walk: 1312, run: 1094 };

export function render(container, { onNavigate, tripData }) {
    const settings = getLocalSettings();

    let data = tripData;
    if (!data) {
        try { data = JSON.parse(sessionStorage.getItem('justgo_trip_result')); }
        catch { data = null; }
    }

    if (!data || !data.points || data.points.length < 2) {
        container.innerHTML = `
            <div class="page">
                <div class="container" style="max-width:600px; text-align:center; padding-top:var(--space-2xl);">
                    <div class="glass-card" style="padding:var(--space-2xl);">
                        <div style="font-size:3rem; margin-bottom:var(--space-md);">🛸</div>
                        <h2 class="text-gradient" style="margin-bottom:var(--space-sm);">No Trip Data</h2>
                        <p class="text-secondary" style="margin-bottom:var(--space-xl);">Start a trip from the home screen to see your summary here.</p>
                        <button class="btn btn-primary" id="go-home-btn">← Go Home</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('go-home-btn')?.addEventListener('click', () => onNavigate('home'));
        return;
    }

    const totalDist = data.totalDistance || 0;
    const duration = data.duration || 0;
    const avgSpeed = duration > 0 ? (totalDist / (duration / 3600)) : 0;
    const speeds = data.points.map(p => p.speed_kmh || 0).filter(s => s > 0);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const anomalies = data.anomalies || [];

    const modeColor = data.mode === 'walk' ? 'var(--neon-cyan)' : data.mode === 'run' ? 'var(--neon-green)' : 'var(--neon-magenta)';
    const modeIcon = data.mode === 'walk' ? '🚶' : data.mode === 'run' ? '🏃' : '🚗';

    // Calculate steps for walk/run
    const showSteps = data.mode === 'walk' || data.mode === 'run';
    const stepCount = data.stepCount || (showSteps ? Math.round(totalDist * (STEPS_PER_KM[data.mode] || 0)) : 0);

    container.innerHTML = `
        <div class="page">
            <div class="container" style="max-width:760px;">

                <!-- Header -->
                <div style="margin-bottom:var(--space-lg);">
                    <p class="cyber-font" style="font-size:0.65rem; letter-spacing:0.2em; color:${modeColor}; margin-bottom:6px; text-transform:uppercase;">
                        ◈ ${modeIcon} ${(data.mode || 'Trip').toUpperCase()} COMPLETE
                    </p>
                    <h2 style="margin-bottom:4px;">Trip <span class="text-gradient">Summary</span></h2>
                    <p class="text-secondary" style="font-size:0.875rem; font-family:var(--font-mono);">
                        ${new Date(data.startTime || Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>

                <!-- Route Map -->
                <div class="glass-card" id="summary-map" style="height:360px; padding:0; margin-bottom:var(--space-lg); overflow:hidden; box-shadow:0 0 40px rgba(167,139,250,0.1);"></div>

                <!-- Metric Grid -->
                <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:var(--space-md); margin-bottom:var(--space-lg);">
                    <div class="metric-box green">
                        <div class="stat-label" style="margin-bottom:8px;">Total Distance</div>
                        <div class="stat-value distance" style="font-size:2rem;">${formatDistance(totalDist, settings.units)}</div>
                    </div>
                    <div class="metric-box purple" style="--mb-color:var(--warning);">
                        <div class="stat-label" style="margin-bottom:8px;">Duration</div>
                        <div class="stat-value time" style="font-size:2rem;">${formatDuration(duration)}</div>
                    </div>
                    <div class="metric-box cyan">
                        <div class="stat-label" style="margin-bottom:8px;">Avg Speed</div>
                        <div class="stat-value speed" style="font-size:2rem;">${formatSpeed(avgSpeed, settings.units)}</div>
                    </div>
                    <div class="metric-box magenta">
                        <div class="stat-label" style="margin-bottom:8px;">Max Speed</div>
                        <div class="stat-value" style="font-size:2rem; color:var(--neon-magenta); text-shadow:0 0 20px var(--neon-magenta-glow);">${formatSpeed(maxSpeed, settings.units)}</div>
                    </div>
                    ${showSteps ? `
                    <div class="metric-box cyan" style="grid-column:1/-1;">
                        <div class="stat-label" style="margin-bottom:8px;">👟 Steps</div>
                        <div class="stat-value" style="font-size:2rem; color:${modeColor}; text-shadow:0 0 20px ${modeColor};">${stepCount.toLocaleString()}</div>
                    </div>
                    ` : ''}
                </div>

                <!-- 3D Speed Visualization -->
                <div style="margin-bottom:var(--space-lg);">
                    <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                        <span style="font-size:1rem;">📈</span>
                        <h3>Speed <span class="text-gradient">Visualization</span></h3>
                        <div style="flex:1; height:1px; background:linear-gradient(90deg,var(--border-color),transparent);"></div>
                    </div>
                    <div class="glass-card" id="summary-3d-mount" style="height:280px; padding:0; position:relative;">
                        <div style="position:absolute; top:16px; left:16px; z-index:10; pointer-events:none;">
                            <p class="cyber-font text-secondary" style="font-size:0.65rem; letter-spacing:0.1em; text-transform:uppercase;">
                                INTERACTIVE 3D SPEED PROFILE
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <div style="display:flex; gap:var(--space-md); justify-content:center; flex-wrap:wrap;">
                    ${!data.id ? `
                        <button class="btn btn-primary" id="save-trip-btn" style="min-width:160px;">💾 &nbsp;Save Trip</button>
                        <button class="btn ai-coach-btn" id="ai-analyze-btn" style="min-width:180px;">🤖 &nbsp;AI Analysis</button>
                        <button class="btn btn-secondary" id="discard-trip-btn">🗑️ &nbsp;Discard</button>
                    ` : `
                        <button class="btn ai-coach-btn" id="ai-coach-btn" style="min-width:180px;">✨ &nbsp;Ask AI Coach</button>
                        <button class="btn btn-secondary" id="back-btn">← &nbsp;Back to History</button>
                        <button class="btn btn-danger"    id="delete-trip-btn">🗑️ &nbsp;Delete Trip</button>
                    `}
                </div>

                <!-- Save loading -->
                <div id="save-loading" style="display:none; text-align:center; margin-top:var(--space-lg);">
                    <div class="loading-spinner"></div>
                    <p class="cyber-font text-secondary" style="margin-top:var(--space-sm); font-size:0.7rem; letter-spacing:0.1em;">ANALYZING & SAVING…</p>
                </div>

                <!-- AI Analysis Panel (renders dynamically) -->
                <div id="ai-coach-mount"></div>
            </div>
        </div>
    `;

    renderSummaryMap(data.points);
    init3DSummary(data.points);

    // ── Save Trip Handler ──
    const saveTrip = async () => {
        if (!isAuthenticated()) {
            // Mark that we want to save after auth completes
            window._justgoPendingSave = true;
            window.dispatchEvent(new CustomEvent('justgo:showAuth'));
            return;
        }
        const btn = document.getElementById('save-trip-btn');
        const discard = document.getElementById('discard-trip-btn');
        const aiBtn = document.getElementById('ai-analyze-btn');
        const loading = document.getElementById('save-loading');
        if (btn) btn.style.display = 'none';
        if (discard) discard.style.display = 'none';
        if (aiBtn) aiBtn.style.display = 'none';
        if (loading) loading.style.display = 'block';

        try {
            const tripPayload = {
                mode: data.mode || 'walk',
                started_at: data.startTime || new Date().toISOString(),
                ended_at: data.endTime || new Date().toISOString(),
                gps_points: data.points.map((p, i) => ({
                    latitude: p.latitude, longitude: p.longitude,
                    altitude: p.altitude || 0, speed_kmh: p.speed_kmh || 0,
                    recorded_at: p.recorded_at, sequence_order: i,
                })),
            };
            await createTrip(tripPayload);
            sessionStorage.removeItem('justgo_trip_result');
            window._justgoPendingSave = false;
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: '✅ Trip saved! Insights generated.', type: 'success' } }));
            onNavigate('history');
        } catch (err) {
            if (loading) loading.style.display = 'none';
            if (btn) btn.style.display = '';
            if (discard) discard.style.display = '';
            if (aiBtn) aiBtn.style.display = '';
            window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: err.message, type: 'error' } }));
        }
    };

    document.getElementById('save-trip-btn')?.addEventListener('click', saveTrip);

    // Auto-retry save after successful authentication
    const authCompleteHandler = () => {
        if (window._justgoPendingSave) {
            saveTrip();
        }
    };
    window.addEventListener('justgo:authComplete', authCompleteHandler);
    // Store handler reference for cleanup
    window._justgoAuthHandler = authCompleteHandler;

    document.getElementById('discard-trip-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('justgo_trip_result');
        onNavigate('home');
    });

    document.getElementById('back-btn')?.addEventListener('click', () => onNavigate('history'));

    document.getElementById('delete-trip-btn')?.addEventListener('click', async () => {
        if (data.id && confirm('Delete this trip permanently?')) {
            try {
                const { deleteTrip } = await import('../services/api.js');
                await deleteTrip(data.id);
                window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: 'Trip deleted.', type: 'info' } }));
                onNavigate('history');
            } catch (err) {
                window.dispatchEvent(new CustomEvent('justgo:toast', { detail: { message: err.message, type: 'error' } }));
            }
        }
    });

    // ── AI Coach Handler (saved trips) ──
    document.getElementById('ai-coach-btn')?.addEventListener('click', () => {
        loadAICoaching(data.id);
    });

    // ── AI Analysis Handler (unsaved trips) ──
    document.getElementById('ai-analyze-btn')?.addEventListener('click', () => {
        loadAIAnalysis(data, stepCount);
    });
}

export function cleanup() {
    if (map) { map.remove(); map = null; }
    if (summaryAnimId) cancelAnimationFrame(summaryAnimId);
    if (summaryRenderer) { summaryRenderer.dispose(); summaryRenderer = null; }
    summaryScene = null; summaryCamera = null;

    // Remove auth complete listener
    if (window._justgoAuthHandler) {
        window.removeEventListener('justgo:authComplete', window._justgoAuthHandler);
        window._justgoAuthHandler = null;
    }
    window._justgoPendingSave = false;
}

// ══════════════════════════════════════════════════════
//  AI ANALYSIS (unsaved trips — POST /api/ai/analyze)
// ══════════════════════════════════════════════════════

async function loadAIAnalysis(data, stepCount) {
    const mount = document.getElementById('ai-coach-mount');
    if (!mount) return;

    // Require auth
    if (!isAuthenticated()) {
        window.dispatchEvent(new CustomEvent('justgo:showAuth'));
        // Re-trigger after auth
        const handler = () => {
            window.removeEventListener('justgo:authComplete', handler);
            loadAIAnalysis(data, stepCount);
        };
        window.addEventListener('justgo:authComplete', handler);
        return;
    }

    const btn = document.getElementById('ai-analyze-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="auth-spinner"></span> Analyzing…';
        btn.classList.add('btn-loading');
    }

    // Show loading skeleton
    mount.innerHTML = `
        <div class="ai-analysis-panel glass-card" style="margin-top:var(--space-xl);">
            <div class="ai-coach-header">
                <div class="ai-coach-header-icon">🤖</div>
                <div class="ai-coach-header-text">
                    <h3>AI <span class="text-gradient">Analysis</span></h3>
                    <p>POWERED BY GEMINI</p>
                </div>
            </div>
            <div class="ai-coach-loading">
                <div class="loading-spinner"></div>
                <p class="ai-loading-text">Analyzing your trip data with AI…</p>
                <div class="ai-skeleton-cards">
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                </div>
            </div>
        </div>
    `;
    mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const payload = {
            mode: data.mode || 'walk',
            started_at: data.startTime || new Date().toISOString(),
            ended_at: data.endTime || new Date().toISOString(),
            total_distance_km: data.totalDistance || 0,
            duration_seconds: data.duration || 0,
            step_count: stepCount || 0,
            gps_points: data.points.map((p, i) => ({
                latitude: p.latitude,
                longitude: p.longitude,
                altitude: p.altitude || 0,
                speed_kmh: p.speed_kmh || 0,
                recorded_at: p.recorded_at,
                sequence_order: i,
            })),
        };

        const result = await analyzeTrip(payload);
        renderFullAnalysis(mount, result, data);

        if (btn) {
            btn.innerHTML = '🤖 &nbsp;Refresh Analysis';
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    } catch (err) {
        mount.innerHTML = `
            <div class="ai-analysis-panel glass-card" style="margin-top:var(--space-xl);">
                <div class="ai-coach-header">
                    <div class="ai-coach-header-icon">🤖</div>
                    <div class="ai-coach-header-text">
                        <h3>AI <span class="text-gradient">Analysis</span></h3>
                        <p>POWERED BY GEMINI</p>
                    </div>
                </div>
                <div class="ai-coach-error">
                    <div class="ai-coach-error-icon">⚠️</div>
                    <p>${err.message || 'Could not generate analysis. Please try again.'}</p>
                    <button class="btn btn-secondary" id="ai-retry-btn">🔄 &nbsp;Try Again</button>
                </div>
            </div>
        `;
        document.getElementById('ai-retry-btn')?.addEventListener('click', () => {
            loadAIAnalysis(data, stepCount);
        });
        if (btn) {
            btn.innerHTML = '🤖 &nbsp;AI Analysis';
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    }
}

function renderFullAnalysis(mount, result, data) {
    const coaching = result.coaching || {};
    const settings = getLocalSettings();
    const modeColor = data.mode === 'walk' ? '#00FFFF' : data.mode === 'run' ? '#39FF14' : '#FF007F';

    const sections = [
        { key: 'performance', icon: '🏆', label: 'Performance' },
        { key: 'pace', icon: '📊', label: 'Pace Analysis' },
        { key: 'slowdowns', icon: '⚠️', label: 'Slowdowns' },
        { key: 'tips', icon: '💡', label: 'Tips' },
        { key: 'goal', icon: '🔮', label: 'Next Goal' },
    ];

    const cards = sections
        .filter(s => coaching[s.key] && coaching[s.key].trim().length > 0)
        .map(s => `
            <div class="ai-insight-card ${s.key}">
                <div class="ai-insight-title">${s.icon} ${s.label}</div>
                <div class="ai-insight-body">${coaching[s.key]}</div>
            </div>
        `)
        .join('');

    mount.innerHTML = `
        <div class="ai-analysis-panel glass-card" style="margin-top:var(--space-xl);">
            <div class="ai-coach-header">
                <div class="ai-coach-header-icon">🤖</div>
                <div class="ai-coach-header-text">
                    <h3>AI <span class="text-gradient">Analysis</span></h3>
                    <p>POWERED BY GEMINI</p>
                </div>
            </div>

            <!-- Charts Section -->
            <div style="margin-bottom:var(--space-lg);">
                <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                    <span style="font-size:0.9rem;">📈</span>
                    <h4 style="font-size:0.85rem; color:var(--text-primary); margin:0;">Speed Over Time</h4>
                </div>
                <div class="ai-chart-container glass-card" style="padding:var(--space-sm);">
                    <canvas id="speed-chart" height="200" style="width:100%;"></canvas>
                </div>
            </div>

            <div style="margin-bottom:var(--space-lg);">
                <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                    <span style="font-size:0.9rem;">📊</span>
                    <h4 style="font-size:0.85rem; color:var(--text-primary); margin:0;">Pace Distribution</h4>
                </div>
                <div class="ai-chart-container glass-card" style="padding:var(--space-sm);">
                    <canvas id="pace-chart" height="180" style="width:100%;"></canvas>
                </div>
            </div>

            <!-- Coaching Cards -->
            <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-md);">
                <span style="font-size:0.9rem;">🧠</span>
                <h4 style="font-size:0.85rem; color:var(--text-primary); margin:0;">Coaching Insights</h4>
            </div>
            <div class="ai-coach-cards">
                ${cards}
            </div>
        </div>
    `;

    mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Draw charts after DOM is ready
    requestAnimationFrame(() => {
        drawSpeedChart(data.points, modeColor, settings);
        drawPaceChart(data.points, modeColor, settings);
    });
}


// ══════════════════════════════════════════════════════
//  CANVAS CHARTS
// ══════════════════════════════════════════════════════

function drawSpeedChart(points, modeColor, settings) {
    const canvas = document.getElementById('speed-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padL = 50, padR = 16, padT = 16, padB = 36;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const speeds = points.map(p => {
        const spd = p.speed_kmh || 0;
        return settings.units === 'mi' ? spd * 0.621371 : spd;
    });
    const maxSpd = Math.max(...speeds, 1);
    const unit = settings.units === 'mi' ? 'mph' : 'km/h';

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + chartW, y);
        ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        const val = maxSpd * (1 - i / 4);
        ctx.fillText(val.toFixed(1), padL - 8, y + 3);
    }

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Time →', padL + chartW / 2, h - 4);

    // Y-axis label
    ctx.save();
    ctx.translate(12, padT + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(unit, 0, 0);
    ctx.restore();

    if (speeds.length < 2) return;

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    gradient.addColorStop(0, modeColor + '60');
    gradient.addColorStop(1, modeColor + '05');

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    for (let i = 0; i < speeds.length; i++) {
        const x = padL + (i / (speeds.length - 1)) * chartW;
        const y = padT + chartH - (speeds[i] / maxSpd) * chartH;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    for (let i = 0; i < speeds.length; i++) {
        const x = padL + (i / (speeds.length - 1)) * chartW;
        const y = padT + chartH - (speeds[i] / maxSpd) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = modeColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = modeColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Average line
    const avgSpd = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const avgY = padT + chartH - (avgSpd / maxSpd) * chartH;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(padL + chartW, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`avg: ${avgSpd.toFixed(1)}`, padL + chartW + 2, avgY + 3);
}

function drawPaceChart(points, modeColor, settings) {
    const canvas = document.getElementById('pace-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padL = 50, padR = 16, padT = 16, padB = 36;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    // Group speeds into buckets
    const speeds = points.map(p => p.speed_kmh || 0).filter(s => s > 0);
    if (speeds.length === 0) return;

    const maxSpd = Math.max(...speeds, 1);
    const bucketCount = Math.min(10, Math.max(4, Math.ceil(speeds.length / 5)));
    const bucketSize = maxSpd / bucketCount;
    const buckets = new Array(bucketCount).fill(0);

    speeds.forEach(s => {
        const idx = Math.min(Math.floor(s / bucketSize), bucketCount - 1);
        buckets[idx]++;
    });

    const maxCount = Math.max(...buckets, 1);

    // Color gradient for bars: cyan → green → magenta
    const barColors = buckets.map((_, i) => {
        const ratio = i / (bucketCount - 1);
        if (ratio < 0.5) {
            const r = Math.round(0 + ratio * 2 * 57);
            const g = Math.round(255 - ratio * 2 * 0);
            const b = Math.round(255 - ratio * 2 * 235);
            return `rgb(${r},${g},${b})`;
        } else {
            const r2 = ratio * 2 - 1;
            const r = Math.round(57 + r2 * 198);
            const g = Math.round(255 - r2 * 255);
            const b = Math.round(20 + r2 * 107);
            return `rgb(${r},${g},${b})`;
        }
    });

    // Y-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        const val = Math.round(maxCount * (1 - i / 4));
        ctx.fillText(val.toString(), padL - 8, y + 3);
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + chartW, y);
        ctx.stroke();
    }

    const unit = settings.units === 'mi' ? 'mph' : 'km/h';

    // Draw bars
    const barGap = 3;
    const barW = (chartW - barGap * (bucketCount - 1)) / bucketCount;

    buckets.forEach((count, i) => {
        const x = padL + i * (barW + barGap);
        const barH = (count / maxCount) * chartH;
        const y = padT + chartH - barH;

        // Bar fill with glow
        ctx.fillStyle = barColors[i];
        ctx.shadowColor = barColors[i];
        ctx.shadowBlur = 6;
        ctx.beginPath();
        const radius = Math.min(3, barW / 2);
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + barW - radius, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
        ctx.lineTo(x + barW, padT + chartH);
        ctx.lineTo(x, padT + chartH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.fill();
        ctx.shadowBlur = 0;

        // X label
        const rangeStart = (i * bucketSize * (settings.units === 'mi' ? 0.621371 : 1)).toFixed(0);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '8px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(rangeStart, x + barW / 2, h - 8);
    });

    // X-axis label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Speed (${unit}) →`, padL + chartW / 2, h - 0);
}


// ══════════════════════════════════════════════════════
//  AI COACH (saved trips — GET /api/ai/coach/:id)
// ══════════════════════════════════════════════════════

async function loadAICoaching(tripId) {
    const mount = document.getElementById('ai-coach-mount');
    if (!mount) return;

    // Disable button while loading
    const btn = document.getElementById('ai-coach-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="auth-spinner"></span> Analyzing…';
        btn.classList.add('btn-loading');
    }

    // Show loading skeleton
    mount.innerHTML = `
        <div class="ai-coach-panel glass-card" id="ai-coach-panel">
            <div class="ai-coach-header">
                <div class="ai-coach-header-icon">🧠</div>
                <div class="ai-coach-header-text">
                    <h3>AI <span class="text-gradient">Coach</span></h3>
                    <p>POWERED BY GEMINI</p>
                </div>
            </div>
            <div class="ai-coach-loading">
                <div class="loading-spinner"></div>
                <p class="ai-loading-text">Analyzing your trip data…</p>
                <div class="ai-skeleton-cards">
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                    <div class="ai-skeleton-card"></div>
                </div>
            </div>
        </div>
    `;

    // Scroll to the panel
    mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const result = await getAICoaching(tripId);
        renderAICoaching(mount, result.coaching);

        // Update button to show "done" state
        if (btn) {
            btn.innerHTML = '✨ &nbsp;Refresh Coaching';
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    } catch (err) {
        // Show error state
        mount.innerHTML = `
            <div class="ai-coach-panel glass-card">
                <div class="ai-coach-header">
                    <div class="ai-coach-header-icon">🧠</div>
                    <div class="ai-coach-header-text">
                        <h3>AI <span class="text-gradient">Coach</span></h3>
                        <p>POWERED BY GEMINI</p>
                    </div>
                </div>
                <div class="ai-coach-error">
                    <div class="ai-coach-error-icon">⚠️</div>
                    <p>${err.message || 'Could not generate coaching insights. Please try again.'}</p>
                    <button class="btn btn-secondary" id="ai-retry-btn">🔄 &nbsp;Try Again</button>
                </div>
            </div>
        `;

        document.getElementById('ai-retry-btn')?.addEventListener('click', () => {
            loadAICoaching(tripId);
        });

        // Reset button
        if (btn) {
            btn.innerHTML = '✨ &nbsp;Ask AI Coach';
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    }
}

function renderAICoaching(mount, coaching) {
    const sections = [
        { key: 'performance', icon: '🏆', label: 'Performance' },
        { key: 'pace', icon: '📊', label: 'Pace Analysis' },
        { key: 'slowdowns', icon: '⚠️', label: 'Slowdowns' },
        { key: 'tips', icon: '💡', label: 'Tips' },
        { key: 'goal', icon: '🔮', label: 'Next Goal' },
    ];

    const cards = sections
        .filter(s => coaching[s.key] && coaching[s.key].trim().length > 0)
        .map(s => `
            <div class="ai-insight-card ${s.key}">
                <div class="ai-insight-title">${s.icon} ${s.label}</div>
                <div class="ai-insight-body">${coaching[s.key]}</div>
            </div>
        `)
        .join('');

    mount.innerHTML = `
        <div class="ai-coach-panel glass-card" id="ai-coach-panel">
            <div class="ai-coach-header">
                <div class="ai-coach-header-icon">🧠</div>
                <div class="ai-coach-header-text">
                    <h3>AI <span class="text-gradient">Coach</span></h3>
                    <p>POWERED BY GEMINI</p>
                </div>
            </div>
            <div class="ai-coach-cards">
                ${cards}
            </div>
        </div>
    `;

    // Scroll into view smoothly
    mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSummaryMap(points) {
    const el = document.getElementById('summary-map');
    if (!el || typeof L === 'undefined' || points.length < 2) return;

    map = L.map(el, { zoomControl: false }).setView([points[0].latitude, points[0].longitude], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', maxZoom: 19,
    }).addTo(map);

    const speeds = points.map(p => p.speed_kmh || 0);
    const maxSpd = Math.max(...speeds, 1);

    for (let i = 1; i < points.length; i++) {
        const ratio = (points[i].speed_kmh || 0) / maxSpd;
        L.polyline(
            [[points[i - 1].latitude, points[i - 1].longitude], [points[i].latitude, points[i].longitude]],
            { color: speedToColor(ratio), weight: 6, opacity: 0.9 }
        ).addTo(map);
    }

    // Animated glow polyline
    L.polyline(points.map(p => [p.latitude, p.longitude]), {
        color: 'rgba(167,139,250,0.2)', weight: 12, opacity: 0.6,
    }).addTo(map);

    L.circleMarker([points[0].latitude, points[0].longitude], {
        radius: 8, fillColor: '#00FF87', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('Start');

    const last = points[points.length - 1];
    L.circleMarker([last.latitude, last.longitude], {
        radius: 8, fillColor: '#FF2D78', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(map).bindPopup('End');

    map.fitBounds(points.map(p => [p.latitude, p.longitude]), { padding: [30, 30] });
}

function speedToColor(ratio) {
    if (ratio < 0.33) {
        const g = Math.round(68 + (ratio / 0.33) * 187);
        return `rgb(239, ${g}, 68)`;
    } else if (ratio < 0.66) {
        const r = Math.round(239 - ((ratio - 0.33) / 0.33) * 187);
        return `rgb(${r}, 255, 68)`;
    }
    return `rgb(0, 255, 135)`;
}

// ── Three.js 3D Speed Visualization ─────────────────

let summaryScene, summaryCamera, summaryRenderer, summaryAnimId;
let ribbonMesh;

function init3DSummary(points) {
    const mount = document.getElementById('summary-3d-mount');
    if (!mount || typeof THREE === 'undefined' || points.length < 2) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    summaryScene = new THREE.Scene();
    summaryCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    summaryCamera.position.set(0, 15, 30);
    summaryCamera.lookAt(0, 0, 0);

    summaryRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    summaryRenderer.setSize(w, h);
    summaryRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(summaryRenderer.domElement);

    const speeds = points.map(p => p.speed_kmh || 0);
    const maxSpd = Math.max(...speeds, 1);

    // Create a 3D Ribbon/Graph
    const pCount = points.length;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 2 * 3); // Top and bottom vertices for each point
    const colors = new Float32Array(pCount * 2 * 3);
    const indices = [];

    const graphWidth = 40; // Total width in 3D space
    const startX = -graphWidth / 2;
    const stepX = graphWidth / (pCount - 1);

    const colorCyan = new THREE.Color(0x00FFFF);
    const colorMagenta = new THREE.Color(0xFF007F);

    for (let i = 0; i < pCount; i++) {
        const x = startX + (i * stepX);
        const speedRatio = (points[i].speed_kmh || 0) / maxSpd;
        const height = Math.max(speedRatio * 15, 0.5); // Min height 0.5

        // Bottom vertex
        positions[(i * 2) * 3] = x;
        positions[(i * 2) * 3 + 1] = 0;
        positions[(i * 2) * 3 + 2] = 0;

        // Top vertex
        positions[(i * 2 + 1) * 3] = x;
        positions[(i * 2 + 1) * 3 + 1] = height;
        positions[(i * 2 + 1) * 3 + 2] = 0;

        // Colors
        const c = colorCyan.clone().lerp(colorMagenta, speedRatio);

        // Bottom color (darker)
        colors[(i * 2) * 3] = c.r * 0.2;
        colors[(i * 2) * 3 + 1] = c.g * 0.2;
        colors[(i * 2) * 3 + 2] = c.b * 0.2;

        // Top color
        colors[(i * 2 + 1) * 3] = c.r;
        colors[(i * 2 + 1) * 3 + 1] = c.g;
        colors[(i * 2 + 1) * 3 + 2] = c.b;

        // Indices for triangles
        if (i < pCount - 1) {
            const v0 = i * 2;
            const v1 = i * 2 + 1;
            const v2 = (i + 1) * 2;
            const v3 = (i + 1) * 2 + 1;

            indices.push(v0, v1, v2);
            indices.push(v1, v3, v2);
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
    });

    ribbonMesh = new THREE.Mesh(geometry, material);
    summaryScene.add(ribbonMesh);

    // Add a glowing grid below
    const gridHelper = new THREE.GridHelper(50, 20, 0x00FFFF, 0x8A2BE2);
    gridHelper.position.y = -0.5;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    summaryScene.add(gridHelper);

    // Mouse interaction for rotation
    let mouseX = 0;
    mount.addEventListener('mousemove', (e) => {
        const rect = mount.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / w - 0.5) * 2;
    });

    function animate() {
        summaryAnimId = requestAnimationFrame(animate);

        // Auto rotate slowly, plus mouse interaction
        if (ribbonMesh) {
            ribbonMesh.rotation.y += 0.002;
            summaryCamera.position.x += (mouseX * 20 - summaryCamera.position.x) * 0.05;
            summaryCamera.lookAt(0, 5, 0);
        }

        summaryRenderer.render(summaryScene, summaryCamera);
    }
    animate();

    const resizeObs = new ResizeObserver(() => {
        if (!mount || !summaryRenderer) return;
        const nw = mount.clientWidth, nh = mount.clientHeight;
        summaryCamera.aspect = nw / nh;
        summaryCamera.updateProjectionMatrix();
        summaryRenderer.setSize(nw, nh);
    });
    resizeObs.observe(mount);
}
