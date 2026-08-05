const express = require('express');
const multer = require('multer');
const Applesign = require('applesign');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public')); // Frontend dosyaları için (index.html vb.)

// Yüklemeler için geçici klasörler
const upload = multer({ dest: 'uploads/' });
fs.ensureDirSync('uploads');
fs.ensureDirSync('output');

// Direct Dropbox/Remote URL İndirme Fonksiyonu
const downloadFile = (url, targetPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(targetPath);
        https.get(url, (response) => {
            // Dropbox ve yönlendirme (redirect) takibi
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, targetPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`İndirme başarısız: HTTP Status ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
        });
    });
};

// İmzalama API Uç Noktası
app.post('/api/sign', upload.fields([
    { name: 'ipa', maxCount: 1 },
    { name: 'p12', maxCount: 1 },
    { name: 'mobileprovision', maxCount: 1 }
]), async (req, res) => {
    let inputIpaPath = '';
    
    try {
        // 1. IPA Kaynağını Belirle (Dosya Yükleme veya Remote URL)
        if (req.files && req.files.ipa) {
            inputIpaPath = req.files.ipa[0].path;
        } else if (req.body.ipaUrl) {
            inputIpaPath = path.join('uploads', `remote_${Date.now()}.ipa`);
            await downloadFile(req.body.ipaUrl, inputIpaPath);
        } else {
            return res.status(400).json({ error: 'IPA dosyası veya geçerli bir URL zorunludur.' });
        }

        // Sertifika Kontrolü
        if (!req.files || !req.files.p12 || !req.files.mobileprovision) {
            return res.status(400).json({ error: '.p12 ve .mobileprovision dosyaları zorunludur.' });
        }

        const p12Path = req.files.p12[0].path;
        const provPath = req.files.mobileprovision[0].path;
        const p12Password = req.body.password || '';

        const outputIpaName = `signed_${Date.now()}.ipa`;
        const outputIpaPath = path.join('output', outputIpaName);

        // 2. Applesign Konfigürasyonu ve İmzalama İşlemi
        const signer = new Applesign({
            file: inputIpaPath,
            out: outputIpaPath,
            identity: p12Path,
            passphrase: p12Password,
            mobileprovision: provPath,
            runpass: true
        });

        await signer.sign();

        // 3. Başarılı Yanıt ve İndirme Bağlantısı
        const downloadUrl = `${req.protocol}://${req.get('host')}/download/${outputIpaName}`;
        
        res.json({
            success: true,
            message: 'İmzalama tamamlandı!',
            downloadUrl: downloadUrl
        });

    } catch (err) {
        console.error('İmzalama Hatası:', err);
        res.status(500).json({ error: 'İmzalama sırasında bir hata oluştu: ' + err.message });
    }
});

// İmzalanan Dosyaları Sunma
app.use('/download', express.static(path.join(__dirname, 'output')));

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
