# Backend development image with hot reload
FROM node:22-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose backend port
EXPOSE 8765

# Run with tsx watch for hot reload
CMD ["npm", "run", "dev"]
