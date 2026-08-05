FROM node:18-bullseye-slim

# Gerekli temel paketleri ve rcodesign (Apple imzalama aracı) indir
RUN apt-get update && apt-get install -y \
    curl \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Pure Rust tabanlı rcodesign aracını kur (Python/C++ derlemesi gerektirmez)
RUN curl -L -o /tmp/rcodesign.tar.gz https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F0.29.0/apple-codesign-0.29.0-x86_64-unknown-linux-musl.tar.gz \
    && tar -xzf /tmp/rcodesign.tar.gz -C /tmp \
    && mv /tmp/apple-codesign-0.29.0-x86_64-unknown-linux-musl/rcodesign /usr/local/bin/ \
    && chmod +x /usr/local/bin/rcodesign \
    && rm -rf /tmp/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
