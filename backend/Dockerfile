# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
# One image, two roles: APP_ROLE=api (HTTP) or APP_ROLE=worker (queues).
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run as the unprivileged user that ships with the node image.
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
