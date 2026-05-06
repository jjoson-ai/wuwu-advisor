const sharp = require('sharp');

const SVG_INPUT = 'app/icon.svg';
const OUTPUT_DIR = 'apps/mobile';

async function generateAdaptiveForeground() {
  const svgContent = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="1024" height="1024">
    <rect width="40" height="40" rx="9" fill="none"/>
    <circle cx="20" cy="20" r="14" fill="none" stroke="#27485e" stroke-width="1.6"/>
    <path d="M20 8 L22.8 20 L20 32 L17.2 20 Z" fill="#27485e"/>
    <circle cx="20" cy="20" r="1.8" fill="#f3efe8"/>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .resize(1024, 1024)
    .png()
    .toFile(`${OUTPUT_DIR}/android-adaptive-foreground.png`);
  
  console.log('Created: android-adaptive-foreground.png (1024×1024)');
}

async function generateAdaptiveMonochrome() {
  const svgContent = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="1024" height="1024">
    <rect width="40" height="40" rx="9" fill="none"/>
    <circle cx="20" cy="20" r="14" fill="none" stroke="#27485e" stroke-width="1.6"/>
    <path d="M20 8 L22.8 20 L20 32 L17.2 20 Z" fill="#27485e"/>
    <circle cx="20" cy="20" r="1.8" fill="none"/>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .resize(1024, 1024)
    .png()
    .toFile(`${OUTPUT_DIR}/android-adaptive-monochrome.png`);
  
  console.log('Created: android-adaptive-monochrome.png (1024×1024)');
}

async function generateSplash() {
  const background = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778">
    <rect width="1284" height="2778" fill="#0B0B14"/>
    <g transform="translate(642, 1389)">
      <circle cx="0" cy="0" r="500" fill="none" stroke="#27485e" stroke-width="70"/>
      <path d="M0 -250 L70 0 L0 250 L-70 0 Z" fill="#27485e"/>
      <circle cx="0" cy="0" r="45" fill="#0B0B14"/>
    </g>
  </svg>
  `);

  await sharp(background)
    .png()
    .toFile(`${OUTPUT_DIR}/android-splash.png`);
  
  console.log('Created: android-splash.png (1284×2778)');
}

async function main() {
  console.log('Generating PNG assets for Android...\n');
  
  await generateAdaptiveForeground();
  await generateAdaptiveMonochrome();
  await generateSplash();
  
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
