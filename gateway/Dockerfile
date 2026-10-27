# AWS gateway image. Local compose mounts nginx.conf instead and does not build this.
# Build from the repository root: docker build -f gateway/Dockerfile -t gateway .
FROM nginx:1.27-alpine
LABEL maintainer="Lil Leap"
COPY gateway/nginx.aws.conf /etc/nginx/conf.d/default.conf
COPY gateway/proxy-headers.conf /etc/nginx/routes/proxy-headers.conf
EXPOSE 4200 4201
