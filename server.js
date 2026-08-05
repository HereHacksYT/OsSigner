const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
fs.ensureDirSync('uploads');
fs.ensureDirSync('output');

// Direct Dropbox/Remote URL İndirme Fonksiyonu
const downloadFile = (url, targetPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(targetPath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, targetPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`İndirme başarısız: HTTP Status ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
        });
    });
};

app.post('/api/sign', upload.fields([
    { name: 'ipa', maxCount: 1 },
    { name: 'p12', maxCount: 1 },
    { name: 'mobileprovision', maxCount: 1 }
]), async (req, res) => {
    let inputIpaPath = '';

    try {
        if (req.files && req.files.ipa) {
            inputIpaPath = req.files.ipa[0].path;
        } else if (req.body.ipaUrl) {
            inputIpaPath = path.join('uploads', `remote_${Date.now()}.ipa`);
            await downloadFile(req.body.ipaUrl, inputIpaPath);
        } else {
            return res.status(400).json({ error: 'IPA dosyası veya geçerli bir URL gereklidir.' });
        }

        // Sertifika işlemleri (Dosya yoksa varsayılanları kullanma mantığın varsa ekleyebilirsin)
        const p12Path = req.files && req.files.p12 ? req.files.p12[0].path : 'certs/default.p12';
        const provPath = req.files && req.files.mobileprovision ? req.files.mobileprovision[0].path : 'certs/default.mobileprovision';
        const p12Password = req.body.password || 'NexCerts';

        const outputIpaName = `signed_${Date.now()}.ipa`;
        const outputIpaPath = path.join('output', outputIpaName);

        // isign Komutu
        const cmd = `isign -c "${p12Path}" -k "${p12Path}" -p "${p12Password}" -m "${provPath}" -o "${outputIpaPath}" "${inputIpaPath}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`isign Hatası: ${stderr || error.message}`);
                return res.status(500).json({ error: 'İmzalama başarısız: ' + (stderr || error.message) });
            }

            const downloadUrl = `${req.protocol}://${req.get('host')}/download/${outputIpaName}`;
            res.json({
                success: true,
                message: 'Başarıyla İmzalandı!',
                downloadUrl: downloadUrl
            });
        });

    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
    }
});

app.use('/download', express.static(path.join(__dirname, 'output')));

app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
