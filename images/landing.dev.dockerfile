# Landing page development image with Vite HMR on port 80
FROM node:22-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port 80 (same as production nginx)
EXPOSE 80

# Run Vite dev server on port 80 with HMR
# Listen on 0.0.0.0 to allow connections from outside the container
CMD ["npm", "run", "dev", "--", "--port", "80", "--host", "0.0.0.0"]
