# Production image for the API.
#   docker build -t real-estate-api .
#   docker run --env-file .env.production -p 3000:3000 real-estate-api
# Run migrations as a release step before starting new containers:
#   docker run --env-file .env.production real-estate-api node dist/db/migrate.js

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
# Never run as root.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/server.js"]
