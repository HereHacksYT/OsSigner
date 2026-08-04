FROM node:18-bullseye

# zsign derlemesi için gerekli bağımlılıkları yükle
RUN apt-get update && apt-get install -y \
    git \
    g++ \
    make \
    libssl-dev \
    libzip-dev \
    && rm -rf /var/lib/apt/lists/*

# zsign deposunu klonla ve derle
RUN git clone https://github.com/zhlynn/zsign.git /opt/zsign \
    && cd /opt/zsign \
    && g++ *.cpp common/*.cpp -lcrypto -lzip -O3 -o zsign \
    && cp zsign /usr/local/bin/

# Uygulama dizinini oluştur
WORKDIR /usr/src/app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyala
COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
