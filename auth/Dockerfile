# Stage 1: build. TypeScript needs compiling to JS before it can run -
# this stage has the full dev toolchain (tsc, type definitions), none of
# which the running service needs.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: run. Only production dependencies and the compiled dist/ cross
# the boundary between stages - no TypeScript compiler, no test files, no
# dev dependencies ship in the final image.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
