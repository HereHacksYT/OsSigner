FROM node:18-bullseye

# Gerekli derleme araçlarını ve kütüphaneleri yükle
RUN apt-get update && apt-get install -y \
    git \
    g++ \
    make \
    cmake \
    libssl-dev \
    libzip-dev \
    && rm -rf /var/lib/apt/lists/*

# zsign reposunu klonla ve CMake ile standart derleme yap
RUN git clone https://github.com/zhlynn/zsign.git /opt/zsign \
    && cd /opt/zsign \
    && mkdir build \
    && cd build \
    && cmake .. \
    && make \
    && cp zsign /usr/local/bin/

# Uygulama çalışma dizini
WORKDIR /usr/src/app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyala
COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
