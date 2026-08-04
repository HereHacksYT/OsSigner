FROM node:18-slim

# zsign derlemek için gerekli araçlar
RUN apt-get update && apt-get install -y \
    git g++ pkg-config libssl-dev unzip \
    && rm -rf /var/lib/apt/lists/*

# zsign'ı klonla ve derle (Ubuntu/Debian yönergesi)
RUN git clone https://github.com/zhlynn/zsign.git /opt/zsign && \
    cd /opt/zsign/build/linux && \
    make clean && make && \
    cp /opt/zsign/build/linux/bin/zsign /usr/local/bin/zsign && \
    rm -rf /opt/zsign

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
