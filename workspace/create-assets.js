const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

async function createGradientBg() {
  // Dark gradient: #0F1117 (top) to #1A1B23 (bottom), 960x540 px
  const width = 960, height = 540;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0F1117"/>
        <stop offset="100%" stop-color="#1A1B23"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, 'bg-dark.png'));
  console.log('Created bg-dark.png');
}

async function createArrowPng() {
  // White arrow right icon, 40x40
  const size = 40;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M5 12h14m0 0l-6-6m6 6l-6 6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, 'arrow-right.png'));
  console.log('Created arrow-right.png');
}

async function createNumberCircle(num, color, filename) {
  // Colored circle with white number, 48x48
  const size = 48;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}"/>
    <text x="${size/2}" y="${size/2 + 1}" text-anchor="middle" dominant-baseline="central" 
          fill="white" font-family="Arial" font-weight="bold" font-size="20">${num}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, filename));
  console.log(`Created ${filename}`);
}

async function createCheckIcon() {
  // Green check icon, 24x24
  const size = 24;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M20 6L9 17l-5-5" stroke="#34D399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, 'check.png'));
  console.log('Created check.png');
}

async function createChevronRight(color, filename) {
  // Small chevron icon, 20x20
  const size = 20;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M9 18l6-6-6-6" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS, filename));
  console.log(`Created ${filename}`);
}

async function main() {
  await createGradientBg();
  await createArrowPng();
  await createCheckIcon();
  await createNumberCircle(1, '#22D3EE', 'num-cyan.png');
  await createNumberCircle(2, '#34D399', 'num-emerald.png');
  await createNumberCircle(3, '#A78BFA', 'num-purple.png');
  await createNumberCircle(1, '#EF4444', 'num-red.png');
  await createNumberCircle(2, '#F97316', 'num-orange.png');
  await createNumberCircle(3, '#34D399', 'num-green.png');
  await createNumberCircle(4, '#22D3EE', 'num-blue.png');
  await createChevronRight('#94A3B8', 'chevron.png');
  console.log('All assets created!');
}

main().catch(e => { console.error(e); process.exit(1); });
