# Backend production build - compiled TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend-trpc/package*.json ./

# Install dependencies (including dev deps for build)
RUN npm ci

# Copy source code
COPY backend-trpc ./

# Build TypeScript to JavaScript
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY backend-trpc/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built code from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user
USER node

# Expose port
EXPOSE 8765

# Start the compiled server
CMD ["node", "dist/index.js"]
