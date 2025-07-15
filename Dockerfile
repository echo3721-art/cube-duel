# Use Node.js image
FROM node:18

# Create app folder
WORKDIR /app

# Copy dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy everything else
COPY . .

# Expose port (match Railway port)
EXPOSE 8080

# Start the app
CMD ["node", "server.js"]
