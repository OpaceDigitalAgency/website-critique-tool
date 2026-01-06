import { getStore } from "@netlify/blobs";

const assetsStore = getStore({
  name: "assets",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

// List all files for the project shown in the screenshot
const projectId = "proj_1767719707168_hbt45nuj2";

console.log(`=== FILES FOR ${projectId} ===\n`);

const { blobs } = await assetsStore.list({ prefix: projectId });

console.log(`Total files: ${blobs.length}\n`);

// Group by type
const filesByType = {
  html: [],
  css: [],
  js: [],
  images: [],
  fonts: [],
  other: []
};

blobs.forEach(blob => {
  const path = blob.key.replace(`${projectId}/`, '');
  const ext = path.split('.').pop()?.toLowerCase();
  
  if (ext === 'html') filesByType.html.push(path);
  else if (ext === 'css') filesByType.css.push(path);
  else if (ext === 'js') filesByType.js.push(path);
  else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) filesByType.images.push(path);
  else if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) filesByType.fonts.push(path);
  else filesByType.other.push(path);
});

console.log('HTML FILES:');
filesByType.html.forEach(f => console.log(`  - ${f}`));

console.log('\nCSS FILES:');
filesByType.css.forEach(f => console.log(`  - ${f}`));

console.log('\nJAVASCRIPT FILES:');
filesByType.js.forEach(f => console.log(`  - ${f}`));

console.log('\nIMAGE FILES:');
filesByType.images.slice(0, 10).forEach(f => console.log(`  - ${f}`));
if (filesByType.images.length > 10) {
  console.log(`  ... and ${filesByType.images.length - 10} more`);
}

console.log('\nFONT FILES:');
filesByType.fonts.forEach(f => console.log(`  - ${f}`));

console.log('\nOTHER FILES:');
filesByType.other.slice(0, 10).forEach(f => console.log(`  - ${f}`));
if (filesByType.other.length > 10) {
  console.log(`  ... and ${filesByType.other.length - 10} more`);
}

