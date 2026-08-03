FROM node:18-slim

RUN apt-get update && apt-get install -y git build-essential cmake libssl-dev unzip && rm -rf /var/lib/apt/lists/*

# zsign kaynaktan derle
RUN git clone https://github.com/zhlynn/zsign.git /tmp/zsign && \
    cd /tmp/zsign && \
    mkdir build && cd build && \
    cmake .. && make && \
    mv zsign /usr/local/bin/ && \
    rm -rf /tmp/zsign

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
