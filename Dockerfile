# Pre-built zsign içeren hazır imaj
FROM pxmx/zsign:latest AS zsign-provider

FROM node:18-bullseye

# zsign için gerekli çalışma zamanı kütüphaneleri
RUN apt-get update && apt-get install -y \
    libssl-dev \
    libzip-dev \
    && rm -rf /var/lib/apt/lists/*

# Hazır derlenmiş zsign ikilisini sistem klasörüne kopyala
COPY --from=zsign-provider /usr/local/bin/zsign /usr/local/bin/zsign

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
