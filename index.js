const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const hostsFilePath = '/etc/hosts';
const backupHostsPath = '/etc/hosts.bak';

// Backup the original hosts file (if not already)
function backupHostsFile() {
    if (!fs.existsSync(backupHostsPath)) {
        fs.copyFileSync(hostsFilePath, backupHostsPath);
    }
}
backupHostsFile();

// Check for valid domain (simple regex, RFC may be stricter)
function isValidDomain(domain) {
    const regex = /^(?!\-)(?:[a-zA-Z0-9\-]{1,63}\.)+[a-zA-Z]{2,}$/;
    return regex.test(domain);
}

const adultTlds = [
    '.adult', '.xxx', '.sex', '.porn', '.cam', '.tube', '.webcam', '.sexy'
];
function isAdultTld(domain) {
    return adultTlds.some(tld => domain.endsWith(tld));
}

app.post('/block', (req, res) => {
    let { domain } = req.body;
    if (!domain) return res.status(400).json({ success: false, message: 'No domain provided' });
    domain = domain.toLowerCase().trim();
    if (!isValidDomain(domain)) return res.status(400).json({ success: false, message: 'Invalid domain' });

    blockDomains([domain])
        .then(() => res.json({ success: true }))
        .catch(err => res.json({ success: false, message: err.message }));
});

app.post('/bulk-block', upload.single('domainsFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    fs.readFile(req.file.path, 'utf8', (err, data) => {
        if (err) return res.json({ success: false, message: 'Failed to read file' });
        let domains = data.split('\n').map(d => d.trim().toLowerCase()).filter(isValidDomain);
        const allDomains = Array.from(new Set(domains.concat(domains.filter(isAdultTld))));
        if (allDomains.length === 0) return res.status(400).json({ success: false, message: 'No valid domains found' });

        blockDomains(allDomains)
            .then(() => res.json({ success: true }))
            .catch(err => res.json({ success: false, message: err.message }));
    });
});

function blockDomains(domains) {
    return new Promise((resolve, reject) => {
        const redirectIP = '127.0.0.1';
        const entries = domains.flatMap(domain => [
            `${redirectIP} ${domain}`,
            `${redirectIP} www.${domain}`
        ]).join('\n') + '\n';

        fs.appendFile(hostsFilePath, entries, err => {
            if (err) return reject(new Error('Failed to modify hosts file. Run with sudo.'));
            require('child_process').exec('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
            resolve();
        });
    });
}


app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
