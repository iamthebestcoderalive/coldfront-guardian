FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --production

# Copy bot source
COPY . .

# Start
CMD [ "node", "index.js" ]
