FROM node:20-alpine

WORKDIR /app

# Worker uses only built-in Node.js modules (https, http)
# No npm install needed
COPY worker/ ./worker/

EXPOSE 3001

CMD ["node", "worker/index.js"]
