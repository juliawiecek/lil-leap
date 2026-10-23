FROM node:24-alpine AS build
WORKDIR /repo
COPY shared/session-core/package*.json shared/session-core/
RUN npm ci --prefix shared/session-core
COPY shared/ shared/
RUN npm run build --prefix shared/session-core
# Include both repository scripts used by the app's prebuild hook.
COPY scripts/sync-session-core-dist.mjs scripts/build-assistive-bootstrap.mjs scripts/
WORKDIR /repo/insights-frontend

COPY insights-frontend/package.json insights-frontend/package-lock.json insights-frontend/.npmrc ./
RUN npm ci

COPY insights-frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime
LABEL maintainer="Lil Leap"
COPY insights-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/insights-frontend/dist/insights-frontend/browser/ /usr/share/nginx/html/
RUN sed -i 's|^pid[[:space:]][^;]*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

USER nginx
RUN nginx -t

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

