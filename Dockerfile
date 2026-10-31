FROM node:24-alpine AS web
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/app.config.js frontend/jsconfig.json ./
COPY frontend/config ./config
COPY frontend/assets ./assets
COPY frontend/src ./src
COPY frontend/shared ./shared
ARG PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=$PUBLIC_API_URL
RUN npx expo export --platform web --max-workers 1 --output-dir /web

FROM node:24-alpine
ENV NODE_ENV=production WEB_DIST=/app/web PORT=4000
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/migrations ./migrations
COPY --from=web /web /app/web
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.js"]

