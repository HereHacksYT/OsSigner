const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();

// Geçici klasörleri oluştur
const uploadDir = path.join(__dirname, 'uploads');
const signedDir = path.join(__dirname, 'signed');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir);

const upload = multer({ dest: 'uploads/' });

// Varsayılan sertifika yolları
const DEFAULT_CERT = path.join(__dirname, 'certs/default.p12');
const DEFAULT_PASS = '123456'; // Kendi varsayılan sertifika şifren
const DEFAULT_PROV = path.join(__dirname, 'certs/default.mobileprovision');

app.use(express.static('public'));
app.use('/download', express.static(signedDir));

app.post('/sign', upload.fields([
  { name: 'ipa', maxCount: 1 },
  { name: 'cert', maxCount: 1 },
  { name: 'provision', maxCount: 1 }
]), (req, res) => {
  if (!req.files || !req.files.ipa) {
    return res.status(400).json({ error: 'Lütfen bir IPA dosyası seçin.' });
  }

  const ipaPath = req.files.ipa[0].path;
  const certPath = req.files.cert ? req.files.cert[0].path : DEFAULT_CERT;
  const provPath = req.files.provision ? req.files.provision[0].path : DEFAULT_PROV;
  const certPass = req.body.password || DEFAULT_PASS;

  const outputFileName = `signed_${Date.now()}.ipa`;
  const outputPath = path.join(signedDir, outputFileName);

  // zsign terminal komutu
  const cmd = `zsign -k "${certPath}" -p "${certPass}" -m "${provPath}" -o "${outputPath}" "${ipaPath}"`;

  exec(cmd, (error, stdout, stderr) => {
    // Geçici yüklenen dosyaları temizle
    if (fs.existsSync(ipaPath)) fs.unlinkSync(ipaPath);
    if (req.files.cert && fs.existsSync(certPath)) fs.unlinkSync(certPath);
    if (req.files.provision && fs.existsSync(provPath)) fs.unlinkSync(provPath);

    if (error) {
      console.error('İmzalama hatası:', stderr);
      return res.status(500).json({ error: 'İmzalama başarısız oldu.', details: stderr });
    }

    res.json({
      message: 'İmzalama başarılı!',
      downloadUrl: `/download/${outputFileName}`
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
