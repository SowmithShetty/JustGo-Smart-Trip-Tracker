/**
 * Home Page — JustGo futuristic dashboard with Three.js interactive globe.
 */

import { checkGPS } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let globeScene, globeCamera, globeRenderer, globeAnimId;
let globeMesh, particlesMesh, glowMesh;

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const mode = localStorage.getItem('justgo_mode') || 'walk';

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

    container.innerHTML = `
        <div class="page home-page" style="padding-top:var(--space-md);">
            <div class="container" style="max-width:680px;">

                <!-- Greeting Banner -->
                <div style="text-align:center; margin-bottom:var(--space-lg);">
                    <p class="cyber-font" style="font-size:0.7rem; letter-spacing:0.2em; color:var(--neon-cyan); margin-bottom:6px; text-transform:uppercase;">
                        ◈ System Online ◈
                    </p>
                    <h1 class="text-gradient" style="font-size:clamp(1.5rem,4vw,2.2rem); margin-bottom:4px;">${greeting}</h1>
                    <p class="text-secondary" style="font-size:0.875rem;">Ready to track your next journey?</p>
                </div>

                <!-- Three.js Globe -->
                <div class="globe-container glass-card" id="globe-mount">
                    <div class="globe-overlay">
                        <p>🌍 &nbsp;LIVE GLOBE · YOUR POSITION</p>
                    </div>
                </div>

                <!-- GPS Status -->
                <div style="display:flex; justify-content:center; margin-bottom:var(--space-lg);">
                    <div class="gps-indicator" id="gps-status">
                        <div class="gps-dot" id="gps-dot"></div>
                        <span id="gps-text">Checking GPS…</span>
                    </div>
                </div>

                <!-- Mode Toggle -->
                <div style="display:flex; justify-content:center; margin-bottom:var(--space-xl);">
                    <div class="mode-toggle" id="mode-toggle">
                        <button class="mode-option ${mode === 'walk'  ? 'active' : ''}" data-mode="walk">🚶 Walk</button>
                        <button class="mode-option ${mode === 'run'   ? 'active' : ''}" data-mode="run">🏃 Run</button>
                        <button class="mode-option ${mode === 'drive' ? 'active' : ''}" data-mode="drive">🚗 Drive</button>
                    </div>
                </div>

                <!-- START Button -->
                <div class="start-btn-container" id="start-section">
                    <div class="start-btn-ring"></div>
                    <div class="start-btn-ring"></div>
                    <div class="start-btn-ring"></div>
                    <button class="start-btn" id="start-btn">START</button>
                </div>

                <!-- Hint text -->
                <div style="text-align:center; margin-top:var(--space-lg);">
                    <p class="cyber-font text-tertiary" style="font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase;">
                        ◈ &nbsp;Tap START to begin tracking&nbsp; ◈
                    </p>
                </div>

                <!-- Quick Info Strip -->
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-sm); margin-top:var(--space-xl);">
                    <div class="metric-box cyan">
                        <div style="font-size:0.625rem; font-family:var(--font-mono); letter-spacing:0.1em; color:var(--text-tertiary); margin-bottom:4px; text-transform:uppercase;">GPS</div>
                        <div id="gps-accuracy-val" class="cyber-font" style="font-size:1.1rem; font-weight:700; color:var(--neon-cyan);">--</div>
                        <div style="font-size:0.6rem; color:var(--text-tertiary); margin-top:2px; font-family:var(--font-mono);">ACCURACY</div>
                    </div>
                    <div class="metric-box purple">
                        <div style="font-size:0.625rem; font-family:var(--font-mono); letter-spacing:0.1em; color:var(--text-tertiary); margin-bottom:4px; text-transform:uppercase;">Mode</div>
                        <div id="current-mode-val" class="cyber-font" style="font-size:1.1rem; font-weight:700; color:var(--accent); text-transform:uppercase;">${mode}</div>
                        <div style="font-size:0.6rem; color:var(--text-tertiary); margin-top:2px; font-family:var(--font-mono);">SELECTED</div>
                    </div>
                    <div class="metric-box green">
                        <div style="font-size:0.625rem; font-family:var(--font-mono); letter-spacing:0.1em; color:var(--text-tertiary); margin-bottom:4px; text-transform:uppercase;">Status</div>
                        <div id="sys-status-val" class="cyber-font" style="font-size:1.1rem; font-weight:700; color:var(--neon-green);">READY</div>
                        <div style="font-size:0.6rem; color:var(--text-tertiary); margin-top:2px; font-family:var(--font-mono);">SYSTEM</div>
                    </div>
                </div>

            </div>
        </div>
    `;

    // ── Initialize Globe ──
    initGlobe();

    // ── Check GPS ──
    checkGPS().then(result => {
        const dot  = document.getElementById('gps-dot');
        const text = document.getElementById('gps-text');
        const acc  = document.getElementById('gps-accuracy-val');
        if (result.available) {
            dot?.classList.add('active');
            if (text) text.textContent = 'GPS Ready';
            if (acc) {
                navigator.geolocation.getCurrentPosition(p => {
                    if (acc) acc.textContent = Math.round(p.coords.accuracy) + 'm';
                }, () => { if (acc) acc.textContent = 'OK'; }, { timeout: 4000 });
            }
        } else {
            if (text) text.textContent = result.status === 'denied' ? 'GPS Denied' : 'Unavailable';
            const statusEl = document.getElementById('sys-status-val');
            if (statusEl) { statusEl.textContent = 'NO GPS'; statusEl.style.color = 'var(--neon-magenta)'; }
        }
    });

    // ── Mode Toggle ──
    document.getElementById('mode-toggle')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-option');
        if (!btn) return;
        document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        localStorage.setItem('justgo_mode', btn.dataset.mode);
        const modeVal = document.getElementById('current-mode-val');
        if (modeVal) modeVal.textContent = btn.dataset.mode.toUpperCase();
    });

    // ── START Button ──
    document.getElementById('start-btn')?.addEventListener('click', () => {
        onNavigate('tracking');
    });
}

export function cleanup() {
    if (globeAnimId) cancelAnimationFrame(globeAnimId);
    if (globeRenderer) { globeRenderer.dispose(); globeRenderer = null; }
    globeScene = null; globeCamera = null;
}

// ── Three.js Globe ──────────────────────────────────

function initGlobe() {
    const mount = document.getElementById('globe-mount');
    if (!mount || typeof THREE === 'undefined') return;

    const w = mount.clientWidth;
    const h = mount.clientHeight - 40;

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    globeCamera.position.z = 4;

    globeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    globeRenderer.setSize(w, h);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.insertBefore(globeRenderer.domElement, mount.firstChild);

    // Wireframe globe
    const globeGeo = new THREE.SphereGeometry(1.3, 48, 48);
    const globeMat = new THREE.MeshBasicMaterial({ color: 0x7C3AED, wireframe: true, transparent: true, opacity: 0.18 });
    globeMesh = new THREE.Mesh(globeGeo, globeMat);
    globeScene.add(globeMesh);

    // Solid inner globe
    const innerGeo = new THREE.SphereGeometry(1.27, 48, 48);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x050810, transparent: true, opacity: 0.75 });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    globeScene.add(innerMesh);

    // Outer glow
    const glowGeo = new THREE.SphereGeometry(1.5, 48, 48);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00F5FF, transparent: true, opacity: 0.04, side: THREE.BackSide });
    glowMesh = new THREE.Mesh(glowGeo, glowMat);
    globeScene.add(glowMesh);

    // Second glow ring (purple)
    const glow2Geo = new THREE.SphereGeometry(1.6, 48, 48);
    const glow2Mat = new THREE.MeshBasicMaterial({ color: 0xA78BFA, transparent: true, opacity: 0.03, side: THREE.BackSide });
    globeScene.add(new THREE.Mesh(glow2Geo, glow2Mat));

    // Particles
    const particlesGeo = new THREE.BufferGeometry();
    const pCount = 900;
    const positions = new Float32Array(pCount * 3);
    const pColors   = new Float32Array(pCount * 3);
    const palette = [[0.66,0.55,0.98],[0,0.96,1],[1,0.18,0.47]];
    for (let i = 0; i < pCount; i++) {
        positions[i*3]   = (Math.random() - 0.5) * 9;
        positions[i*3+1] = (Math.random() - 0.5) * 9;
        positions[i*3+2] = (Math.random() - 0.5) * 9;
        const c = palette[Math.floor(Math.random() * palette.length)];
        pColors[i*3] = c[0]; pColors[i*3+1] = c[1]; pColors[i*3+2] = c[2];
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeo.setAttribute('color',    new THREE.BufferAttribute(pColors, 3));
    particlesMesh = new THREE.Points(particlesGeo, new THREE.PointsMaterial({
        size: 0.018, transparent: true, opacity: 0.65, vertexColors: true,
    }));
    globeScene.add(particlesMesh);

    addGlobeGridLines();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => addLocationMarker(pos.coords.latitude, pos.coords.longitude),
            () => {}, { timeout: 5000 }
        );
    }

    let mouseX = 0, mouseY = 0;
    mount.addEventListener('mousemove', (e) => {
        const rect = mount.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / w - 0.5) * 2;
        mouseY = ((e.clientY - rect.top)  / h - 0.5) * 2;
    });

    function animate() {
        globeAnimId = requestAnimationFrame(animate);
        if (!globeMesh) return;

        globeMesh.rotation.y  += 0.004;
        innerMesh.rotation.y  += 0.004;
        glowMesh.rotation.y   += 0.002;
        glowMesh.rotation.x   += 0.001;

        globeMesh.rotation.x  += (mouseY * 0.35 - globeMesh.rotation.x) * 0.025;
        innerMesh.rotation.x   = globeMesh.rotation.x;

        particlesMesh.rotation.y += 0.0006;
        particlesMesh.rotation.x += 0.0003;

        globeRenderer.render(globeScene, globeCamera);
    }
    animate();

    const resizeObs = new ResizeObserver(() => {
        if (!mount || !globeRenderer) return;
        const nw = mount.clientWidth, nh = mount.clientHeight - 40;
        globeCamera.aspect = nw / nh;
        globeCamera.updateProjectionMatrix();
        globeRenderer.setSize(nw, nh);
    });
    resizeObs.observe(mount);
}

function addGlobeGridLines() {
    const mat  = new THREE.LineBasicMaterial({ color: 0x6C5CE7, transparent: true, opacity: 0.1 });
    const mat2 = new THREE.LineBasicMaterial({ color: 0x00F5FF, transparent: true, opacity: 0.06 });

    for (let lat = -60; lat <= 60; lat += 30) {
        const r = 1.31 * Math.cos(lat * Math.PI / 180);
        const y = 1.31 * Math.sin(lat * Math.PI / 180);
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
        }
        globeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lat === 0 ? mat2 : mat));
    }
    for (let lon = 0; lon < 360; lon += 30) {
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const lat = (i / 64) * Math.PI - Math.PI / 2;
            pts.push(new THREE.Vector3(
                1.31 * Math.cos(lat) * Math.cos(lon * Math.PI / 180),
                1.31 * Math.sin(lat),
                1.31 * Math.cos(lat) * Math.sin(lon * Math.PI / 180)
            ));
        }
        globeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
}

function addLocationMarker(lat, lon) {
    if (!globeScene) return;
    const phi   = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const r = 1.33;
    const x = -r * Math.sin(phi) * Math.cos(theta);
    const y =  r * Math.cos(phi);
    const z =  r * Math.sin(phi) * Math.sin(theta);

    const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00FF87 })
    );
    dot.position.set(x, y, z);
    globeScene.add(dot);

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.08, 32),
        new THREE.MeshBasicMaterial({ color: 0x00FF87, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.position.set(x, y, z);
    ring.lookAt(0, 0, 0);
    globeScene.add(ring);
}
