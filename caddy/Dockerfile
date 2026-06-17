# Build the React PWA, then serve it with Caddy.
# Build context is the repo root (see docker-compose.yml: caddy.build.context = .)

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web /web/dist /srv
