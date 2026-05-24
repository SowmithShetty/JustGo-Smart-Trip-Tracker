<h1 align="center">
  <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Globe%20Showing%20Europe-Africa.png" alt="Globe" width="40" height="40" />
  JustGo — Smart GPS Trip Tracker
</h1>

<p align="center">
  <em>A premium, full-stack web application for intelligent GPS trip tracking, real-time mapping, and contextual speed analysis.</em>
</p>

<div align="center">

  [![Live Demo](https://img.shields.io/badge/Live_Demo-Website-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://just-go-smart-trip-tracker-2zh7.vercel.app/)
  
  ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
  ![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20Vanilla%20JS-purple?style=flat-square)
  ![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20Python-green?style=flat-square)
  ![Database](https://img.shields.io/badge/database-PostgreSQL%20(Supabase)-blue?style=flat-square)

</div>

<br />

> **🚀 Live Website:** [just-go-smart-trip-tracker-2zh7.vercel.app](https://just-go-smart-trip-tracker-2zh7.vercel.app/)
> 
> *(Note: The backend is hosted on a free Render tier and may take a few seconds to wake up from sleep on the first request. Thank you for your patience!)*

---

## ✨ Features

- 🌍 **Interactive 3D Globe:** Immersive home dashboard experience built with Three.js.
- 📍 **Real-time GPS Tracking:** Live map tracking using Leaflet.js and the Browser Geolocation API.
- 📊 **Speed Analysis Engine:** Precision velocity calculation using Haversine formulas.
- 🔍 **Smart Contextual Insights:** Automatically identifies slowing factors such as intersections, weather, elevation, and traffic signals.
- 🗺️ **Gradient Route Maps:** Routes are beautifully color-coded by velocity (🟢 Fast -> 🔴 Slow) for rapid analysis.
- 📜 **Trip History & Analytics:** High-fidelity dashboard that saves and loads your past tracked performance.
- 🌙 **Modern Glassmorphism UI:** Harmonic dark and light system tailored with Outfit and Space Mono fonts.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|-------|------------|-------------|
| **Frontend** | Vite + Vanilla JS/HTML5/CSS3 | Ultra-lightweight, extremely responsive SPA bundle |
| **3D Graphics** | Three.js | Beautiful WebGL interactive rendering for the home globe |
| **Maps** | Leaflet.js + OpenStreetMap | Interactive, high-performance web maps |
| **Backend** | Python FastAPI | Async-first, high-throughput REST API |
| **Database** | PostgreSQL (Supabase) | Scalable database with persistent storage via connection pooling |
| **External APIs** | Open-Meteo & Overpass | Elevation profile extraction and traffic signal crossing detection |

---

## 💻 Local Development

### Prerequisites
- Python 3.10+
- Node.js 18+
- Supabase account (or local PostgreSQL)

### 1. Setup Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate      # On Windows
source venv/bin/activate   # On Mac/Linux
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL=postgresql://postgres.your_ref:password@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
JWT_SECRET=your_super_secret_jwt_key
```

Run the backend:
```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Setup Frontend
```bash
cd ../frontend
npm install
```

Create a `.env.development` file in the `frontend/` directory:
```env
VITE_API_URL=
```
*(Leave empty so requests proxy through Vite to localhost:8000)*

Run the frontend dev server:
```bash
npm run dev
```

---

## 📚 Documentation
For an in-depth look at the architecture, API endpoints, and database models, please refer to the comprehensive [DOCUMENTATION.md](file:///c:/Users/sowmi/Documents/JustGo-Smart-Trip-Planner/DOCUMENTATION.md).
