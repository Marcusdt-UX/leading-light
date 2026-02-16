/* HTTPS dev server for LAN testing (geolocation requires secure context) */
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

const PORT  = 8443;
const HOST  = '0.0.0.0';
const ROOT  = __dirname;

/* ---- Generate self-signed cert if missing ---- */
const keyPath  = path.join(ROOT, 'key.pem');
const certPath = path.join(ROOT, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('Generating self-signed certificate…');
  const forge = requireForge();
  const pki   = forge.pki;
  const keys  = pki.rsa.generateKeyPair(2048);
  const cert  = pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [{ name: 'commonName', value: 'LeadingLight Dev' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  /* Discover LAN IPs dynamically */
  const os = require('os');
  const lanIPs = Object.values(os.networkInterfaces()).flat()
    .filter(n => n.family === 'IPv4' && !n.internal)
    .map(n => n.address);

  const altNames = [
    { type: 7, ip: '127.0.0.1' },
    { type: 2, value: 'localhost' }
  ];
  lanIPs.forEach(ip => altNames.push({ type: 7, ip }));

  /* Add SAN for localhost + all LAN IPs */
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'subjectAltName', altNames }
  ]);
  console.log('SAN IPs:', ['127.0.0.1', ...lanIPs].join(', '));

  cert.sign(keys.privateKey);

  fs.writeFileSync(keyPath,  pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(certPath, pki.certificateToPem(cert));
  console.log('Certificate created: cert.pem + key.pem');
}

function requireForge() {
  try { return require('node-forge'); }
  catch {
    console.log('Installing node-forge…');
    execSync('npm install node-forge --no-save', { cwd: ROOT, stdio: 'inherit' });
    return require('node-forge');
  }
}

/* ---- MIME types ---- */
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

/* ---- Request handler ---- */
function handler(req, res) {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---- Start servers ---- */
const opts = {
  key:  fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

https.createServer(opts, handler).listen(PORT, HOST, () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat()
    .filter(n => n.family === 'IPv4' && !n.internal)
    .map(n => n.address);

  console.log('\n🔒 HTTPS server running!\n');
  console.log(`   Local:   https://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   LAN:     https://${ip}:${PORT}`));
  console.log('\n⚠️  Your browser will warn about the self-signed cert.');
  console.log('   Click "Advanced" → "Proceed" to continue.\n');
  console.log('   Geolocation WILL work over this HTTPS connection! ✅\n');
});

/* Also redirect HTTP → HTTPS */
http.createServer((req, res) => {
  const host = req.headers.host?.replace(/:\d+$/, '') || 'localhost';
  res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
  res.end();
}).listen(8080, HOST, () => {
  console.log(`   HTTP :8080 → redirects to HTTPS :${PORT}`);
});
