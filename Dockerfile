FROM node:20-alpine

WORKDIR /app

# Only copy what the worker needs
COPY package*.json ./
RUN npm install --omit=dev

COPY worker/ ./worker/

EXPOSE 3001

CMD ["node", "worker/index.js"]
