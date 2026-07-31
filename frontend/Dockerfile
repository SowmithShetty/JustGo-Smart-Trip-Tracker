# ─────────────────────────────────────────────────────────────
# JustGo Frontend — Vite SPA served via Nginx
# Multi-stage build: Node builds → Nginx serves
# ─────────────────────────────────────────────────────────────

# Stage 1: Build the Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source
COPY . .

# Build for production (points API to the Docker backend service)
RUN VITE_API_URL=http://localhost:8000 npm run build


# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine AS runtime

LABEL maintainer="sowmithshetty01152@gmail.com"
LABEL project="JustGo Smart Trip Planner"
LABEL component="frontend"

# Copy built assets into Nginx's serve directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
