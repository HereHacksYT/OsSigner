FROM node:18-slim

# zsign için gerekli bağımlılıklar ve wget
RUN apt-get update && \
    apt-get install -y wget unzip && \
    rm -rf /var/lib/apt/lists/*

# zsign binary'sini indir ve /usr/local/bin'e koy
RUN wget -q https://github.com/zhlynn/zsign/releases/download/v1.1.3/zsign_linux_amd64.zip && \
    unzip zsign_linux_amd64.zip && \
    mv zsign /usr/local/bin/ && \
    chmod +x /usr/local/bin/zsign && \
    rm zsign_linux_amd64.zip

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
