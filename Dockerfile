FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY worker/ ./worker/

EXPOSE 3001

CMD ["node", "worker/index.js"]
