const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const URL = 'https://github.com/zhlynn/zsign/releases/download/v1.1.3/zsign_linux_amd64.zip';
const ZIP_PATH = './zsign.zip';
const OUTPUT = './zsign';

console.log('⏬ zsign indiriliyor...');

https.get(URL, (res) => {
  if (res.statusCode !== 200) {
    console.error(`İndirme hatası: HTTP ${res.statusCode}`);
    process.exit(1);
  }
  const file = fs.createWriteStream(ZIP_PATH);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('📦 ZIP indirildi, çıkartılıyor...');
    try {
      execSync(`unzip -o ${ZIP_PATH} -d .`);
      fs.chmodSync(OUTPUT, 0o755);
      fs.unlinkSync(ZIP_PATH);
      console.log('✅ zsign hazır.');
    } catch (err) {
      console.error('ZIP çıkarma hatası:', err.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Bağlantı hatası:', err.message);
  process.exit(1);
});
