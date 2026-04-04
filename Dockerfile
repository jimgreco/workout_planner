# Stage 1: Build Frontend
FROM node:20-slim AS build-frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite build variables (passed during build)
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Backend
FROM node:20-alpine AS backend
WORKDIR /app
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
