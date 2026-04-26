<h1 align="center">
  <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Globe%20Showing%20Europe-Africa.png" alt="Globe" width="40" height="40" />
  JustGo — Smart GPS Trip Tracker
</h1>

<p align="center">
  <em>A full-stack web application for intelligent GPS trip tracking, real-time mapping, and contextual speed analysis.</em>
</p>

<div align="center">

  [![Live Demo](https://img.shields.io/badge/Live_Demo-Website-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://just-go-smart-trip-tracker-2zh7.vercel.app/)
  
  ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
  ![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20Vanilla%20JS-purple?style=flat-square)
  ![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20Python-green?style=flat-square)

</div>

<br />

> **🚀 Live Website:** [just-go-smart-trip-tracker-2zh7.vercel.app](https://just-go-smart-trip-tracker-2zh7.vercel.app/)

*(Note: The backend is hosted on a free Render tier and may take ~50 seconds to wake up from sleep on the first request. Please be patient!)*

---

## ✨ Features

- 🌍 **Interactive 3D Globe:** Built with Three.js for an immersive home dashboard experience.
- 📍 **Real-time GPS Tracking:** Live map integration using Leaflet.js and the Browser Geolocation API.
- 📊 **Speed Analysis Engine:** Accurate Haversine distance calculations and velocity tracking.
- 🔍 **Smart Contextual Insights:** Automatically detects slowdowns caused by elevation changes, traffic signals, and intersections.
- 🗺️ **Gradient Route Maps:** Routes are color-coded by speed (🟢 Fast -> 🔴 Slow) for quick visual analysis.
- 📜 **Trip History:** Dashboard featuring mini-map thumbnails of past journeys.
- 🌙 **Glassmorphism UI:** Modern, responsive dark/light theme that works seamlessly across desktop and mobile.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|-------|------------|-------------|
| **Frontend** | Vite + Vanilla JS/HTML/CSS | Lightning-fast build tool with native web standards |
| **3D Graphics** | Three.js | WebGL rendering for the interactive globe |
| **Maps** | Leaflet.js + OpenStreetMap | Open-source interactive mapping |
| **Backend** | Python FastAPI | High-performance asynchronous API |
| **Database** | SQLite | Lightweight local database *(See deployment notes)* |
| **External APIs** | Open-Meteo & OSM Overpass | Elevation data and traffic signal detection |

---

## 💻 Local Development

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Start the Backend
