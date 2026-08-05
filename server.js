const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
fs.ensureDirSync('uploads');
fs.ensureDirSync('output');

// URL'den IPA indirme fonksiyonu
const downloadFile = (url, targetPath) => {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, targetPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`İndirme başarısız oldu. Durum Kodu: ${response.statusCode}`));
            }
            const file = fs.createWriteStream(targetPath);
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
        });
    });
};

// certs/ klasöründeki dosyaları otomatik tespit eden fonksiyon
const getDefaultCertFiles = async () => {
    const certsDir = path.join(__dirname, 'certs');
    let p12Path = '';
    let provPath = '';
    let defaultPassword = 'NexCerts';

    if (await fs.pathExists(certsDir)) {
        const files = await fs.readdir(certsDir);
        
        const p12File = files.find(f => f.endsWith('.p12'));
        const provFile = files.find(f => f.endsWith('.mobileprovision'));
        const passFile = files.find(f => f === 'password.txt');

        if (p12File) p12Path = path.join(certsDir, p12File);
        if (provFile) provPath = path.join(certsDir, provFile);
        
        if (passFile) {
            const content = await fs.readFile(path.join(certsDir, passFile), 'utf-8');
            if (content.trim()) {
                defaultPassword = content.trim();
            }
        }
    }

    return { p12Path, provPath, defaultPassword };
};

app.post('/api/sign', upload.fields([
    { name: 'ipa', maxCount: 1 },
    { name: 'p12', maxCount: 1 },
    { name: 'mobileprovision', maxCount: 1 }
]), async (req, res) => {
    const workDir = path.join(__dirname, 'uploads', `work_${Date.now()}`);
    let inputIpaPath = '';

    try {
        await fs.ensureDir(workDir);

        // 1. IPA Kaynağını Belirle
        if (req.files && req.files.ipa) {
            inputIpaPath = req.files.ipa[0].path;
        } else if (req.body.ipaUrl) {
            inputIpaPath = path.join(workDir, 'downloaded.ipa');
            await downloadFile(req.body.ipaUrl, inputIpaPath);
        } else {
            return res.status(400).json({ error: 'Lütfen bir IPA dosyası yükleyin veya geçerli bir URL girin.' });
        }

        // 2. Varsayılan Sertifika Bilgilerini Taraması
        const defaultCerts = await getDefaultCertFiles();

        const p12Path = (req.files && req.files.p12) 
            ? req.files.p12[0].path 
            : defaultCerts.p12Path;
            
        const provPath = (req.files && req.files.mobileprovision) 
            ? req.files.mobileprovision[0].path 
            : defaultCerts.provPath;
            
        const password = req.body.password || defaultCerts.defaultPassword;

        if (!p12Path || !provPath) {
            return res.status(500).json({ error: 'Sertifika (.p12) veya Mobileprovision dosyası bulunamadı!' });
        }

        // 3. P12 Dönüştürme Düzeltmesi (Legacy P12 -> Modern P12)
        const pemPath = path.join(workDir, 'temp.pem');
        const fixedP12Path = path.join(workDir, 'fixed.p12');
        
        const convertCmd = `(openssl pkcs12 -in "${p12Path}" -nodes -passin pass:"${password}" -legacy -out "${pemPath}" 2>/dev/null || openssl pkcs12 -in "${p12Path}" -nodes -passin pass:"${password}" -out "${pemPath}") && openssl pkcs12 -export -in "${pemPath}" -out "${fixedP12Path}" -passout pass:"${password}"`;

        await new Promise((resolve) => {
            exec(convertCmd, () => resolve());
        });

        const finalP12Path = (await fs.pathExists(fixedP12Path)) ? fixedP12Path : p12Path;

        // 4. IPA İçeriğini Çıkar
        const extractDir = path.join(workDir, 'extracted');
        await fs.ensureDir(extractDir);

        await new Promise((resolve, reject) => {
            exec(`unzip -q "${inputIpaPath}" -d "${extractDir}"`, (err) => err ? reject(err) : resolve());
        });

        const payloadDir = path.join(extractDir, 'Payload');
        const apps = await fs.readdir(payloadDir);
        const appBundle = path.join(payloadDir, apps[0]);

        // Bundle ID ve İsim Çekme (Plutil veya basit regex mantığıyla okunamazsa fallback tanımlanır)
        const appName = apps[0].replace('.app', '');
        const bundleId = `com.ossigner.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        // 5. Mobileprovision Dosyasını Kopyala
        await fs.copy(provPath, path.join(appBundle, 'embedded.mobileprovision'));

        // 6. rcodesign ile İmzalama İşlemi
        const signCmd = `rcodesign sign --p12-file "${finalP12Path}" --p12-password "${password}" "${appBundle}"`;
        
        await new Promise((resolve, reject) => {
            exec(signCmd, (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || stdout || err.message));
                resolve();
            });
        });

        // 7. Dosyayı Tekrar IPA Olarak Paketle
        const fileId = Date.now();
        const outputIpaName = `signed_${fileId}.ipa`;
        const outputIpaPath = path.join(__dirname, 'output', outputIpaName);
        
        await new Promise((resolve, reject) => {
            exec(`cd "${extractDir}" && zip -qr "${outputIpaPath}" Payload`, (err) => err ? reject(err) : resolve());
        });

        // 8. iOS Otomatik Kurulum için Manifest XML Oluşturma
        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const ipaUrl = `${hostUrl}/download/${outputIpaName}`;
        
        const manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
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
                    <key>software-package</key>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${bundleId}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${appName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

        const manifestName = `manifest_${fileId}.plist`;
        await fs.writeFile(path.join(__dirname, 'output', manifestName), manifestContent);

        // Temizlik
        await fs.remove(workDir);

        // Doğrudan Kurulum Linki (itms-services)
        const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${hostUrl}/download/${manifestName}`)}`;

        res.json({
            success: true,
            message: 'İmzalama başarıyla tamamlandı!',
            downloadUrl: installUrl
        });

    } catch (err) {
        if (await fs.pathExists(workDir)) await fs.remove(workDir);
        console.error("İmzalama Hatası:", err);
        res.status(500).json({ error: 'İmzalama başarısız: ' + err.message });
    }
});

app.use('/download', express.static(path.join(__dirname, 'output')));

app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
