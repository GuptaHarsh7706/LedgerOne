# ==============================================================================
# LedgerOne Web Client — Multi-Stage Production Dockerfile
# Stage 1: Build static assets using Node.js 22 Alpine
# Stage 2: Serve high-performance bundle using Nginx Alpine
# ==============================================================================

# --- Stage 1: Build Application ---
FROM node:22-alpine AS builder

WORKDIR /app

# Cache package dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source and build production bundle
COPY . .
RUN npm run build

# --- Stage 2: Production Nginx Server ---
FROM nginx:alpine

# Purge default static site
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled SPA bundle from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy optimized reverse-proxy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
