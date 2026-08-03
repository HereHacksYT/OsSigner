const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Geçici işlemler için ana klasör
const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// Multer ile geçici depolama (RAM'de)
const upload = multer({ storage: multer.memoryStorage() });

// Ana sayfa
app.use(express.static('public'));

// Geçici temizlik: 10 dakika sonra sil
const cleanupMap = new Map();

function scheduleCleanup(id) {
  cleanupMap.set(id, setTimeout(() => {
    const dir = path.join(TMP_DIR, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    cleanupMap.delete(id);
  }, 10 * 60 * 1000)); // 10 dakika
}

// /sign endpoint: dosyaları al, imzala
app.post('/sign', upload.fields([
  { name: 'ipa', maxCount: 1 },
  { name: 'p12', maxCount: 1 },
  { name: 'mobileprovision', maxCount: 1 },
  { name: 'password' } // metin alanı
]), async (req, res) => {
  try {
    // Gelen dosyaları kontrol et
    if (!req.files['ipa'] || !req.files['p12'] || !req.files['mobileprovision']) {
      return res.status(400).json({ error: 'Eksik dosya. ipa, p12 ve mobileprovision zorunludur.' });
    }

    const password = req.body.password || '';

    // Benzersiz işlem ID'si oluştur
    const jobId = uuidv4();
    const jobDir = path.join(TMP_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Dosyaları diske kaydet
    const ipaPath = path.join(jobDir, 'app.ipa');
    const p12Path = path.join(jobDir, 'cert.p12');
    const mpPath = path.join(jobDir, 'app.mobileprovision');
    const outputIpaPath = path.join(jobDir, 'signed.ipa');

    fs.writeFileSync(ipaPath, req.files['ipa'][0].buffer);
    fs.writeFileSync(p12Path, req.files['p12'][0].buffer);
    fs.writeFileSync(mpPath, req.files['mobileprovision'][0].buffer);

    // zsign komutunu çalıştır
    // zsign -k cert.p12 -p password -m app.mobileprovision -o signed.ipa app.ipa
    const zsignArgs = [
      '-k', p12Path,
      '-p', password,
      '-m', mpPath,
      '-o', outputIpaPath,
      ipaPath
    ];

    console.log(`Zsign başlatılıyor: zsign ${zsignArgs.join(' ')}`);

    execFile('zsign', zsignArgs, { timeout: 60000 }, (error, stdout, stderr) => {
      // İşlem bittiğinde temizlik planla (başarılı da olsa hata da olsa geçici dosyalar silinsin)
      scheduleCleanup(jobId);

      if (error) {
        console.error('zsign hatası:', stderr || error.message);
        return res.status(500).json({ error: 'İmzalama başarısız. Hata: ' + (stderr || error.message) });
      }

      console.log('zsign başarılı:', stdout);

      // Başarılı yanıt
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const downloadUrl = `${baseUrl}/download/${jobId}`;
      const manifestUrl = `${baseUrl}/manifest/${jobId}`;

      res.json({
        success: true,
        download_url: downloadUrl,
        manifest_url: manifestUrl,
        ota_install_link: `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`
      });
    });

  } catch (err) {
    console.error('Genel hata:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// İmzalanmış IPA'yı indirme endpoint'i
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const filePath = path.join(TMP_DIR, id, 'signed.ipa');

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Dosya bulunamadı veya süresi dolmuş.');
  }

  res.download(filePath, 'signed.ipa');
});

// OTA Kurulum manifest.plist endpoint'i
app.get('/manifest/:id', (req, res) => {
  const id = req.params.id;
  const filePath = path.join(TMP_DIR, id, 'signed.ipa');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Dosya bulunamadı.');
  }

  // IPA'nın tam URL'sini oluştur
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const ipaUrl = `${baseUrl}/download/${id}`;

  // Basit bir manifest (gerçek bundle bilgilerini mobileprovision'dan çekmek daha doğru olur,
  // ancak demo için sabit bir örnek kullanıyoruz. Dinamik yapmak isterseniz ek parsing gerekir.)
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>com.example.signedapp</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>Signed App</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

  res.set('Content-Type', 'text/xml');
  res.send(manifest);
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`IPA Signer ${PORT} portunda çalışıyor.`);
});
