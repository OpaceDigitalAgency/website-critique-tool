import { getStore } from "@netlify/blobs";

const projectsStore = getStore({
  name: "projects",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

const assetsStore = getStore({
  name: "assets",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

console.log("=== PROJECTS STORE ===");
const { blobs: projectBlobs } = await projectsStore.list();
console.log("Total blobs:", projectBlobs.length);
projectBlobs.forEach(blob => {
  console.log(`  - ${blob.key} (${blob.size} bytes)`);
});

console.log("\n=== ASSETS STORE ===");
const { blobs: assetBlobs } = await assetsStore.list();
console.log("Total blobs:", assetBlobs.length);
assetBlobs.slice(0, 20).forEach(blob => {
  console.log(`  - ${blob.key} (${blob.size} bytes)`);
});

if (assetBlobs.length > 20) {
  console.log(`  ... and ${assetBlobs.length - 20} more`);
}

