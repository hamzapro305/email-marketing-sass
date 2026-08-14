# ── Build stage: compile the React SPA ───────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html tailwind.config.cjs postcss.config.cjs components.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage: nginx serves the SPA and proxies /api ─────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
