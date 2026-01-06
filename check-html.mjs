import { getStore } from "@netlify/blobs";

const assetsStore = getStore({
  name: "assets",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

// List all assets for the project
const projectId = "proj_1767719707168_hbt45nuj2";
console.log(`=== ASSETS FOR ${projectId} ===`);
const { blobs } = await assetsStore.list({ prefix: projectId });
console.log("Total assets:", blobs.length);

const htmlFiles = blobs.filter(b => b.key.endsWith('.html'));
console.log("\nHTML files:", htmlFiles.length);
htmlFiles.forEach(blob => {
  console.log(`  - ${blob.key}`);
});

// Check each HTML file
for (const blob of htmlFiles) {
  console.log(`\n=== ${blob.key} ===`);
  const html = await assetsStore.get(blob.key, { type: "text" });

  if (!html) {
    console.log("  ❌ File not found or empty");
    continue;
  }

  console.log(`  Size: ${html.length} bytes`);
  console.log(`  First 300 chars:`, html.substring(0, 300));

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    console.log("  ❌ No body tag found");
  } else {
    const bodyContent = bodyMatch[1].trim();
    console.log(`  ✅ Body tag found`);
    console.log(`  Body content length: ${bodyContent.length}`);
    console.log(`  Has content: ${bodyContent.length > 0}`);
    if (bodyContent.length > 0) {
      console.log(`  First 200 chars of body:`, bodyContent.substring(0, 200));
    }
  }
}



