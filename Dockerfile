# Stage 1: Build Frontend
FROM node:22-slim AS build-frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite build variables (passed during build)
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL
ARG VITE_DEV_BYPASS_AUTH
ARG VITE_GIT_COMMIT
ARG VITE_APP_VERSION
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DEV_BYPASS_AUTH=$VITE_DEV_BYPASS_AUTH
ENV VITE_GIT_COMMIT=$VITE_GIT_COMMIT
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build

# Stage 2: Backend
FROM node:22-alpine AS backend
WORKDIR /app
ARG APP_VERSION=1.0.0
ARG GIT_COMMIT=local
ARG BUILD_TIME=local
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend/ ./backend/
EXPOSE 3001
CMD ["node", "backend/local-server.mjs"]

# Stage 3: Final Production Image (Nginx for Frontend)
FROM nginx:alpine AS frontend
COPY --from=build-frontend /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
