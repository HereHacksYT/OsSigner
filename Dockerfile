FROM node:18-bullseye-slim

RUN apt-get update && apt-get install -y \
    zip \
    unzip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
