FROM node:18-slim

# Derleme araçları
RUN apt-get update && apt-get install -y \
    git build-essential cmake pkg-config libssl-dev unzip \
    && rm -rf /var/lib/apt/lists/*

# zsign'ı derle
RUN git clone https://github.com/zhlynn/zsign.git /opt/zsign && \
    cd /opt/zsign && \
    mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && \
    cp bin/zsign /usr/local/bin/zsign && \
    rm -rf /opt/zsign

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
