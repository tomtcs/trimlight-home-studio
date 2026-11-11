FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npx vite build --config vite.standalone.config.mjs
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8888
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/standalone-dist ./standalone-dist
COPY --from=build /app/shared ./shared
COPY --from=build /app/standalone ./standalone
COPY --from=build /app/node_modules/suncalc ./node_modules/suncalc
USER node
VOLUME ["/data"]
EXPOSE 8888
CMD ["node","standalone/server.mjs"]
