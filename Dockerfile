FROM node:18-slim

# zsign binary'sini projeden kopyala
COPY zsign /usr/local/bin/zsign
RUN chmod +x /usr/local/bin/zsign

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
