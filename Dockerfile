FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV TART_API_HOST=0.0.0.0
ENV TART_STATIC_DIR=dist/client

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["npm", "run", "start"]
