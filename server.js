const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));

const cleanupMap = new Map();
function scheduleCleanup(id) {
  cleanupMap.set(id, setTimeout(() => {
    const dir = path.join(TMP_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    cleanupMap.delete(id);
  }, 10 * 60 * 1000));
}

app.post('/sign', upload.fields([
  { name: 'ipa', maxCount: 1 },
  { name: 'p12', maxCount: 1 },
  { name: 'mobileprovision', maxCount: 1 },
  { name: 'password' }
]), async (req, res) => {
  try {
    if (!req.files['ipa'] || !req.files['p12'] || !req.files['mobileprovision']) {
      return res.status(400).json({ error: 'Eksik dosya. ipa, p12 ve mobileprovision zorunludur.' });
    }

    const password = req.body.password || '';
    const jobId = uuidv4();
    const jobDir = path.join(TMP_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const ipaPath = path.join(jobDir, 'app.ipa');
    const p12Path = path.join(jobDir, 'cert.p12');
    const mpPath = path.join(jobDir, 'app.mobileprovision');
    const outputIpaPath = path.join(jobDir, 'signed.ipa');

    fs.writeFileSync(ipaPath, req.files['ipa'][0].buffer);
    fs.writeFileSync(p12Path, req.files['p12'][0].buffer);
    fs.writeFileSync(mpPath, req.files['mobileprovision'][0].buffer);

    // zsign artık proje kökünde, ./zsign olarak çağrılıyor
    const zsignArgs = [
      '-k', p12Path,
      '-p', password,
      '-m', mpPath,
      '-o', outputIpaPath,
      ipaPath
    ];

    execFile('./zsign', zsignArgs, { timeout: 60000 }, (error, stdout, stderr) => {
      scheduleCleanup(jobId);
      if (error) {
        console.error('zsign hatası:', stderr || error.message);
        return res.status(500).json({ error: 'İmzalama başarısız: ' + (stderr || error.message) });
      }

      console.log('zsign başarılı:', stdout);
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
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.get('/download/:id', (req, res) => {
  const filePath = path.join(TMP_DIR, req.params.id, 'signed.ipa');
  if (!fs.existsSync(filePath)) return res.status(404).send('Dosya bulunamadı.');
  res.download(filePath, 'signed.ipa');
});

app.get('/manifest/:id', (req, res) => {
  const filePath = path.join(TMP_DIR, req.params.id, 'signed.ipa');
  if (!fs.existsSync(filePath)) return res.status(404).send('Dosya bulunamadı.');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const ipaUrl = `${baseUrl}/download/${req.params.id}`;
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

app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`));
