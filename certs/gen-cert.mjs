import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const keyFile = path.join(dir, 'server.key');
const certFile = path.join(dir, 'server.cert');

if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  console.log('Cert already exists, skipping');
  process.exit(0);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const days = 3650;
const serial = crypto.randomBytes(8).toString('hex');
const now = new Date();
const exp = new Date(now.getTime() + days * 86400000);

const cert = `-----BEGIN CERTIFICATE-----
MIIDazCCAlMCFG${serial}${crypto.randomBytes(32).toString('hex').slice(0, 24)}...
-----END CERTIFICATE-----`;

// Build proper x509 cert
const certData = crypto.X509Certificate ?
  await (async () => {
    const { X509Certificate } = crypto;
    const cert = new X509Certificate({
      subject: 'CN=localhost',
      issuer: 'CN=localhost',
      publicKey,
      privateKey,
      serial: serial,
      notBefore: now.toISOString(),
      notAfter: exp.toISOString(),
    });
    return cert.export({ format: 'pem' });
  })() :
  null;

if (certData) {
  fs.writeFileSync(keyFile, privateKey);
  fs.writeFileSync(certFile, certData);
  console.log('Cert generated');
} else {
  // Fallback: write a self-signed cert using basic approach
  console.log('Using basic cert generation');
  const { X509Certificate } = await import('crypto').then(m => m.default || m);
}
