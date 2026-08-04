FROM node:18-slim

# zsign derleme bağımlılıklarını yükle
RUN apt-get update && apt-get install -y git build-essential libssl-dev

# zsign deposunu klonla ve derle
RUN git clone https://github.com/zhly2018/zsign.git && \
    cd zsign && \
    g++ *.cpp -lcrypto -O3 -o /usr/local/bin/zsign

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000
CMD ["npm", "start"]
