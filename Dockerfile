FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install ddgs --break-system-packages && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
EXPOSE 3000
ENV MODE=http
ENV PORT=3000
CMD ["node", "dist/index.js"]
