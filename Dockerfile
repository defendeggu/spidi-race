# --- build stage: compile client (Vite) and bundle server (esbuild)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# --- runtime stage: plain Node, no node_modules needed (server is a single bundle)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8090 IN_DOCKER=1 DATA_DIR=/app/data
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY --chown=node:node data/leaderboard.template.json data/
EXPOSE 8090
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8090/health || exit 1
CMD ["node", "server/dist/index.cjs"]
