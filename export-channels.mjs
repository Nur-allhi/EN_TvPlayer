// Export channels from Firebase to channels.json
// Run this from the main iptv-player directory:
// node tv-mode/export-channels.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Firebase config (same as main app)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

async function exportChannels() {
  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, 'channels'));

    const channels = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      channels.push({
        name: data.name || '',
        url: data.url || '',
        channelNumber: data.channelNumber || 0,
        useProxy: data.useProxy !== false,
        drm: data.drm || null,
      });
    });

    // Sort by channel number
    channels.sort((a, b) => a.channelNumber - b.channelNumber);

    // Write to tv-mode/channels.json
    const outputPath = join(__dirname, 'channels.json');
    writeFileSync(outputPath, JSON.stringify(channels, null, 2));
    console.log(`Exported ${channels.length} channels to ${outputPath}`);
  } catch (error) {
    console.error('Export failed:', error.message);
    console.log('Make sure Firebase env vars are set in main app\'s .env');
  }
}

exportChannels();
