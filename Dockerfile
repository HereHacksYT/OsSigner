FROM node:18-slim

# curl ve unzip kur
RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*

# Zsign'ı doğrudan indir ve çıkar
RUN curl -L -o /tmp/zsign.zip https://github.com/zhlynn/zsign/releases/download/v1.1.3/zsign_linux_amd64.zip && \
    unzip -o /tmp/zsign.zip -d /usr/local/bin/ && \
    chmod +x /usr/local/bin/zsign && \
    rm /tmp/zsign.zip

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
