FROM node:20-slim

# Install OpenSSL for Prisma and tools for debugging
RUN apt-get update && apt-get install -y openssl procps lsof && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 3000

# Start the development server
CMD ["npm", "run", "dev"]
