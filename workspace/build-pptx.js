const html2pptx = require('/home/z/my-project/skills/pptx/scripts/html2pptx');
const PptxGenJS = require('pptxgenjs');
const path = require('path');

async function main() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'ValiAutoFlow';
  pptx.title = 'JHON v4.0 - Transformacion y Evolucion';

  const slidesDir = path.join(__dirname, 'slides');
  const totalSlides = 8;

  for (let i = 1; i <= totalSlides; i++) {
    console.log(`Processing slide ${i}...`);
    await html2pptx(path.join(slidesDir, `slide${i}.html`), pptx);
  }

  const outPath = '/home/z/my-project/download/JHON_v4.0_Transformacion.pptx';
  await pptx.writeFile({ fileName: outPath });
  console.log(`Presentation saved to: ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
