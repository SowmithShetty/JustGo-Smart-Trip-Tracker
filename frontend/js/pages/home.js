/**
 * Home Page — "Just Go" Dashboard with Three.js interactive globe.
 */

import { checkGPS } from '../services/geo.js';
import { getLocalSettings } from '../services/storage.js';

let globeScene, globeCamera, globeRenderer, globeAnimId;
let globeMesh, particlesMesh, glowMesh;

export function render(container, { onNavigate }) {
    const settings = getLocalSettings();
    const mode = localStorage.getItem('justgo_mode') || 'walk';

    container.innerHTML = `
        <div class="page home-page">
            <div class="container">
                <!-- Three.js Globe -->
                <div class="globe-container glass-card" id="globe-mount">
                    <div class="globe-overlay">
                        <p>🌍 Interactive Globe — Your Position</p>
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
                <div style="display:flex; justify-content:center; margin-bottom:var(--space-2xl);">
                    <div class="mode-toggle" id="mode-toggle">
                        <button class="mode-option ${mode === 'walk' ? 'active' : ''}" data-mode="walk">🚶 Walk</button>
                        <button class="mode-option ${mode === 'run' ? 'active' : ''}" data-mode="run">🏃 Run</button>
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

                <!-- Quick Stats -->
                <div style="margin-top:var(--space-2xl); text-align:center;">
                    <p class="text-tertiary" style="font-size:0.8125rem;">
                        Tap START to begin tracking your journey
                    </p>
                </div>
            </div>
        </div>
    `;

    // ── Initialize Three.js Globe ──
    initGlobe();

    // ── Check GPS ──
    checkGPS().then(result => {
        const dot = document.getElementById('gps-dot');
        const text = document.getElementById('gps-text');
        if (result.available) {
            dot?.classList.add('active');
            if (text) text.textContent = 'GPS Ready';
        } else {
            if (text) text.textContent = result.status === 'denied' ? 'GPS Denied' : 'GPS Unavailable';
        }
    });

    // ── Mode Toggle ──
    document.getElementById('mode-toggle')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-option');
        if (!btn) return;
        document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        localStorage.setItem('justgo_mode', btn.dataset.mode);
    });

    // ── START Button ──
    document.getElementById('start-btn')?.addEventListener('click', () => {
        onNavigate('tracking');
    });
}

export function cleanup() {
    if (globeAnimId) cancelAnimationFrame(globeAnimId);
    if (globeRenderer) {
        globeRenderer.dispose();
        globeRenderer = null;
    }
    globeScene = null;
    globeCamera = null;
}

// ── Three.js Globe ──────────────────────────────────

function initGlobe() {
    const mount = document.getElementById('globe-mount');
    if (!mount || typeof THREE === 'undefined') return;

    const w = mount.clientWidth;
    const h = mount.clientHeight - 40; // leave room for overlay

    // Scene
    globeScene = new THREE.Scene();

    // Camera
    globeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    globeCamera.position.z = 4;

    // Renderer
    globeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    globeRenderer.setSize(w, h);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.insertBefore(globeRenderer.domElement, mount.firstChild);

    // Globe sphere with wireframe
    const globeGeo = new THREE.SphereGeometry(1.3, 48, 48);
    const globeMat = new THREE.MeshBasicMaterial({
        color: 0x6C5CE7,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
    });
    globeMesh = new THREE.Mesh(globeGeo, globeMat);
    globeScene.add(globeMesh);

    // Solid inner globe
    const innerGeo = new THREE.SphereGeometry(1.28, 48, 48);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a2e,
        transparent: true,
        opacity: 0.6,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    globeScene.add(innerMesh);

    // Glow effect
    const glowGeo = new THREE.SphereGeometry(1.45, 48, 48);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xA78BFA,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
    });
    glowMesh = new THREE.Mesh(glowGeo, glowMat);
    globeScene.add(glowMesh);

    // Floating particles
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 600;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 8;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({
        color: 0xA78BFA,
        size: 0.015,
        transparent: true,
        opacity: 0.6,
    });
    particlesMesh = new THREE.Points(particlesGeo, particlesMat);
    globeScene.add(particlesMesh);

    // Add grid lines (latitude/longitude)
    addGlobeGridLines();

    // Try to add user location marker
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => addLocationMarker(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { timeout: 5000 }
        );
    }

    // Mouse interaction
    let mouseX = 0, mouseY = 0;
    mount.addEventListener('mousemove', (e) => {
        const rect = mount.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / w - 0.5) * 2;
        mouseY = ((e.clientY - rect.top) / h - 0.5) * 2;
    });

    // Animation loop
    function animate() {
        globeAnimId = requestAnimationFrame(animate);
        if (!globeMesh) return;

        globeMesh.rotation.y += 0.003;
        innerMesh.rotation.y += 0.003;
        glowMesh.rotation.y += 0.002;

        // Subtle tilt towards mouse
        globeMesh.rotation.x += (mouseY * 0.3 - globeMesh.rotation.x) * 0.02;
        innerMesh.rotation.x = globeMesh.rotation.x;

        particlesMesh.rotation.y += 0.0005;
        particlesMesh.rotation.x += 0.0003;

        globeRenderer.render(globeScene, globeCamera);
    }

    animate();

    // Resize handler
    const resizeObs = new ResizeObserver(() => {
        if (!mount || !globeRenderer) return;
        const nw = mount.clientWidth;
        const nh = mount.clientHeight - 40;
        globeCamera.aspect = nw / nh;
        globeCamera.updateProjectionMatrix();
        globeRenderer.setSize(nw, nh);
    });
    resizeObs.observe(mount);
}

function addGlobeGridLines() {
    const material = new THREE.LineBasicMaterial({ color: 0x6C5CE7, transparent: true, opacity: 0.08 });

    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
        const r = 1.31 * Math.cos(lat * Math.PI / 180);
        const y = 1.31 * Math.sin(lat * Math.PI / 180);
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        globeScene.add(new THREE.Line(geo, material));
    }

    // Longitude lines
    for (let lon = 0; lon < 360; lon += 30) {
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const lat = (i / 64) * Math.PI - Math.PI / 2;
            const x = 1.31 * Math.cos(lat) * Math.cos(lon * Math.PI / 180);
            const y = 1.31 * Math.sin(lat);
            const z = 1.31 * Math.cos(lat) * Math.sin(lon * Math.PI / 180);
            pts.push(new THREE.Vector3(x, y, z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        globeScene.add(new THREE.Line(geo, material));
    }
}

function addLocationMarker(lat, lon) {
    if (!globeScene) return;
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const r = 1.32;
    const x = -r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    // Marker dot
    const dotGeo = new THREE.SphereGeometry(0.03, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x34D399 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(x, y, z);
    globeScene.add(dot);

    // Glow ring
    const ringGeo = new THREE.RingGeometry(0.04, 0.06, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x34D399,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, y, z);
    ring.lookAt(0, 0, 0);
    globeScene.add(ring);
}
