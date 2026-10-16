FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
LABEL maintainer="Lil Leap"
WORKDIR /app
ENV NODE_ENV=production

# The outbox must exist and belong to appuser before a named volume is mounted on it (password reset emails).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/outbox && chown appuser:appgroup /app/outbox

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

USER appuser
EXPOSE 8081
CMD ["node", "dist/main.js"]
