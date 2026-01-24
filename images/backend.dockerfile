# Backend development image with hot reload
FROM node:22-alpine

WORKDIR /app

# Copy package files first for better caching
COPY backend-trpc/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY backend-trpc/ .

# Expose backend port
EXPOSE 8765

# Run with tsx watch for hot reload
CMD ["npm", "run", "dev"]
