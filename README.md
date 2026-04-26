# JustGo — Smart GPS Trip Tracker

A full-stack web application for GPS trip tracking with real-time mapping, speed analysis, and contextual insights.

![License](https://img.shields.io/badge/license-MIT-blue)
![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20Vanilla%20JS-purple)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20Python-green)

## Features

- 🌍 **Interactive 3D Globe** (Three.js) on the home dashboard
- 📍 **Real-time GPS tracking** with live map (Leaflet.js)
- 📊 **Speed analysis engine** with Haversine distance calculation
- 🔍 **Smart insights** — detects slowdowns from elevation, traffic signals, intersections
- 🗺️ **Gradient route maps** — color-coded by speed (green = fast, red = slow)
- 📜 **Trip history** with mini-map thumbnails
- 🌙 **Dark/Light theme** with glassmorphism UI
- 📱 **Responsive** — works on mobile and desktop

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + Vanilla JS/HTML/CSS |
| 3D Graphics | Three.js |
| Maps | Leaflet.js + OpenStreetMap |
| GPS | Browser Geolocation API |
| Backend | Python FastAPI |
| Database | SQLite |
| Elevation | Open-Meteo API |
| Traffic | OSM Overpass API |

## Local Development

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:3000

## Deployment

### Frontend → Vercel

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repository
3. Set the **Root Directory** to `frontend`
4. Set **Build Command** to `npm run build`
5. Set **Output Directory** to `dist`
6. Deploy!

### Backend → Render.com

1. Go to [render.com](https://render.com), create a new Web Service
2. Connect your GitHub repo
3. Set the **Root Directory** to `backend`
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variable: `JWT_SECRET` = (generate a random string)
7. Deploy!

### Connect Frontend to Backend

After deploying both, update the frontend to point to your Render backend URL.
In `frontend/js/services/api.js`, set:

```javascript
const API_BASE = 'https://your-app.onrender.com';
```

Or set the `JUSTGO_API_URL` variable in your Vercel environment settings.

## Project Structure

```
├── backend/
│   ├── main.py          # FastAPI app entry
│   ├── database.py      # SQLite setup
│   ├── models.py        # Pydantic models
│   ├── analysis.py      # Haversine, anomaly detection
│   ├── requirements.txt
│   ├── render.yaml      # Render deployment
│   └── routers/
│       ├── auth.py      # Register/Login/JWT
│       ├── trips.py     # Trip CRUD + analysis
│       └── users.py     # Settings
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json      # Vercel deployment
│   ├── styles/
│   │   ├── main.css     # Design system
│   │   └── components.css
│   └── js/
│       ├── app.js       # SPA router
│       ├── pages/
│       │   ├── home.js      # Three.js globe + START
│       │   ├── tracking.js  # Live map + GPS
│       │   ├── summary.js   # Gradient map + insights
│       │   ├── history.js   # Trip list
│       │   └── profile.js   # Settings
│       └── services/
│           ├── api.js       # HTTP client
│           ├── geo.js       # Geolocation
│           └── storage.js   # LocalStorage
└── README.md
```

## License

MIT
