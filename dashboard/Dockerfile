FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the dashboard port
EXPOSE 3001

# Start the development server
CMD ["npm", "run", "dev"]
