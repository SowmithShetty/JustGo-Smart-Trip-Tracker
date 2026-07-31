# ─────────────────────────────────────────────────────────────
# JustGo Backend — Python FastAPI
# Multi-stage build for smaller production image
# ─────────────────────────────────────────────────────────────

# Stage 1: Builder — install dependencies in a virtual env
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for compiling native extensions (asyncpg, bcrypt)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# Stage 2: Runtime — lean production image
FROM python:3.12-slim AS runtime

LABEL maintainer="sowmithshetty01152@gmail.com"
LABEL project="JustGo Smart Trip Planner"
LABEL component="backend"

WORKDIR /app

# Install only the runtime C-library needed by asyncpg
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the pre-built virtual env from the builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application source code
COPY . .

# Remove files that shouldn't be in the image
RUN rm -f .env justgo.db find_api_url.py inspect_trip.py

# Expose the FastAPI port
EXPOSE 8000

# Health check — hit /api/health every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run with uvicorn (production-ready)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
