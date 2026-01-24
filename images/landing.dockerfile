# Landing page development image with Vite HMR
FROM node:22-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5928

# Run Vite dev server with HMR
# Listen on 0.0.0.0 to allow connections from outside the container
CMD ["npm", "run", "dev", "--", "--port", "5928", "--host", "0.0.0.0"]
