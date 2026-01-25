# Stage 1: Build the Vite application
FROM node:22-alpine AS builder

# Build argument for backend URL (required for Vite to embed it)
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

WORKDIR /app

# Copy landing page package files
COPY landing-page/package*.json ./

# Install dependencies
RUN npm install

# Copy backend types for tRPC (needed for TypeScript path mapping @backend/*)
# Place at ../backend-trpc relative to /app to match local dev structure
COPY backend-trpc ../backend-trpc

# Copy landing page source
COPY landing-page .

# Build the static files (VITE_BACKEND_URL will be embedded)
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # SPA fallback - serve index.html for all non-file routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
