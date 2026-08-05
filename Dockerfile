FROM node:18-bullseye-slim

# Derleme araçları ve kütüphaneleri yükle
RUN apt-get update && apt-get install -y \
    git \
    g++ \
    make \
    libssl-dev \
    libzip-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# zsign deposunun en kararlı sürümünü klonla ve derle
RUN git clone --depth 1 https://github.com/zhlynn/zsign.git /tmp/zsign \
    && cd /tmp/zsign \
    && g++ main.cpp zsign.cpp bundle.cpp macho.cpp openssl.cpp plist.cpp sha.cpp signing.cpp -o zsign -lcrypto -lzip \
    && mv zsign /usr/local/bin/ \
    && rm -rf /tmp/zsign

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
