FROM node:18-bullseye

# Derleme için gerekli paketleri yükle
RUN apt-get update && apt-get install -y \
    git \
    g++ \
    make \
    pkg-config \
    libssl-dev \
    libzip-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# zsign reposunu klonla ve Linux build dizininde Makefile ile derle
RUN git clone https://github.com/zhlynn/zsign.git /opt/zsign \
    && cd /opt/zsign/build/linux \
    && make \
    && cp zsign /usr/local/bin/

# Uygulama çalışma dizini
WORKDIR /usr/src/app

# Node.js bağımlılıklarını yükle
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyala
COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
