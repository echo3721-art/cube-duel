# Use a lightweight Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the rest of the project
COPY . .

# Expose the port your server uses
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
