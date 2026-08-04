const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
const signedDir = path.join(__dirname, 'signed');
[uploadDir, signedDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const upload = multer({ dest: 'uploads/' });

const DEFAULT_CERT = path.join(__dirname, 'certs/default.p12');
const DEFAULT_PASS = 'NexCerts';
const DEFAULT_PROV = path.join(__dirname, 'certs/default.mobileprovision');

app.use(express.static('public'));
app.use('/download', express.static(signedDir));

// Yönlendirmeleri (301, 302, 307, 308) eksiksiz takip eden gelişmiş indirme fonksiyonu
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      // Yönlendirme varsa yeni URL'yi takip et
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`İndirme başarısız. HTTP Kodu: ${response.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => reject(err));
  });
}

app.post('/sign', upload.fields([
  { name: 'ipa', maxCount: 1 },
  { name: 'cert', maxCount: 1 },
  { name: 'provision', maxCount: 1 }
]), async (req, res) => {
  let ipaPath = '';
  const remoteIpaUrl = req.body.ipaUrl;

  try {
    if (req.files && req.files.ipa && req.files.ipa[0]) {
      ipaPath = req.files.ipa[0].path;
    } else if (remoteIpaUrl) {
      ipaPath = path.join(uploadDir, `remote_${Date.now()}.ipa`);
      await downloadFile(remoteIpaUrl, ipaPath);
    } else {
      return res.status(400).json({ error: 'Lütfen bir IPA dosyası yükleyin veya geçerli bir URL girin.' });
    }

    const certPath = (req.files && req.files.cert) ? req.files.cert[0].path : DEFAULT_CERT;
    const provPath = (req.files && req.files.provision) ? req.files.provision[0].path : DEFAULT_PROV;
    const certPass = req.body.password || DEFAULT_PASS;

    const outputFileName = `signed_${Date.now()}.ipa`;
    const outputPath = path.join(signedDir, outputFileName);

    const cmd = `zsign -k "${certPath}" -p "${certPass}" -m "${provPath}" -o "${outputPath}" "${ipaPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (fs.existsSync(ipaPath)) fs.unlinkSync(ipaPath);
      if (req.files && req.files.cert && fs.existsSync(certPath)) fs.unlinkSync(certPath);
      if (req.files && req.files.provision && fs.existsSync(provPath)) fs.unlinkSync(provPath);

      if (error) {
        return res.status(500).json({ error: 'İmzalama başarısız.', details: stderr });
      }

      res.json({
        message: 'İmzalama başarıyla tamamlandı!',
        downloadUrl: `/download/${outputFileName}`
      });
    });

  } catch (err) {
    if (ipaPath && fs.existsSync(ipaPath)) fs.unlinkSync(ipaPath);
    res.status(500).json({ error: 'Uzak IPA indirilemedi.', details: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
