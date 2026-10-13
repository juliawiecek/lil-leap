FROM node:24-alpine AS build
WORKDIR /repo
COPY shared/session-core/package*.json shared/session-core/
RUN npm ci --prefix shared/session-core
COPY shared/session-core/src shared/session-core/src
COPY shared/session-core/tsconfig.json shared/session-core/tsconfig.json
RUN npm run build --prefix shared/session-core
WORKDIR /repo/insights-frontend

COPY insights-frontend/package.json insights-frontend/package-lock.json insights-frontend/.npmrc ./
RUN npm ci

COPY insights-frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime
LABEL maintainer="Lil Leap"
COPY insights-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/insights-frontend/dist/insights-frontend/browser/ /usr/share/nginx/html/
RUN sed -i 's|pid        /var/run/nginx.pid;|pid        /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

