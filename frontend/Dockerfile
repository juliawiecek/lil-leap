FROM node:24-alpine AS build
WORKDIR /repo
COPY shared/session-core/package*.json shared/session-core/
RUN npm ci --prefix shared/session-core
COPY shared/session-core/src shared/session-core/src
COPY shared/session-core/tsconfig.json shared/session-core/tsconfig.json
RUN npm run build --prefix shared/session-core
# The app's prebuild script copies the shared build into node_modules with this.
COPY scripts/sync-session-core-dist.mjs scripts/sync-session-core-dist.mjs
WORKDIR /repo/frontend

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime
LABEL maintainer="Lil Leap"
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist/nexttrade-angular/browser/ /usr/share/nginx/html/
RUN sed -i 's|^pid[[:space:]][^;]*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

USER nginx
RUN nginx -t

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

