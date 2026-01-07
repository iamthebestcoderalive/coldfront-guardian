FROM ghcr.io/puppeteer/puppeteer:23.6.0

USER root
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy bot source
COPY . .

# Environment Setup
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Start
CMD [ "node", "index.js" ]
