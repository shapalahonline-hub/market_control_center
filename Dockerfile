# ── stage 1: build the React SPA ──────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── stage 2: python runtime (serves API + the built SPA, single service) ───
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /fe/dist ./frontend/dist
WORKDIR /app/backend
# Railway provides $PORT at runtime; FastAPI serves frontend/dist (../frontend/dist)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
