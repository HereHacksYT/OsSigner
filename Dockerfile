FROM node:18-bullseye-slim

# Python ve imzalama için temel araçları yükle
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# isign'ı pip ile sorunsuz yükle
RUN pip3 install isign

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
