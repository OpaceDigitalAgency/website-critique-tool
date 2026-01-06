import { getStore } from "@netlify/blobs";

const assetsStore = getStore({
  name: "assets",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

const projectsStore = getStore({
  name: "projects",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

console.log("=== CLEANUP ORPHANED ASSETS ===\n");

// Get list of valid project IDs
const { blobs: projectBlobs } = await projectsStore.list();
const validProjectIds = new Set(
  projectBlobs
    .map(b => b.key)
    .filter(key => key.startsWith("proj_"))
);

console.log(`Valid projects: ${validProjectIds.size}`);
validProjectIds.forEach(id => console.log(`  - ${id}`));

// Get all assets
const { blobs: assetBlobs } = await assetsStore.list();
console.log(`\nTotal assets: ${assetBlobs.length}`);

// Find orphaned assets
const orphanedAssets = [];
const assetsByProject = {};

assetBlobs.forEach(blob => {
  const projectId = blob.key.split('/')[0];
  
  if (!assetsByProject[projectId]) {
    assetsByProject[projectId] = [];
  }
  assetsByProject[projectId].push(blob.key);
  
  if (!validProjectIds.has(projectId)) {
    orphanedAssets.push(blob.key);
  }
});

console.log(`\nAssets by project:`);
Object.entries(assetsByProject).forEach(([projectId, assets]) => {
  const isOrphaned = !validProjectIds.has(projectId);
  console.log(`  ${projectId}: ${assets.length} assets ${isOrphaned ? '(ORPHANED)' : ''}`);
});

console.log(`\nOrphaned assets: ${orphanedAssets.length}`);

if (orphanedAssets.length > 0) {
  console.log("\nDo you want to delete these orphaned assets? (yes/no)");
  
  // Read user input
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('> ', async (answer) => {
    if (answer.toLowerCase() === 'yes') {
      console.log('\nDeleting orphaned assets...');
      let deleted = 0;
      
      for (const assetKey of orphanedAssets) {
        try {
          await assetsStore.delete(assetKey);
          deleted++;
          if (deleted % 100 === 0) {
            console.log(`  Deleted ${deleted}/${orphanedAssets.length}...`);
          }
        } catch (e) {
          console.error(`  Failed to delete ${assetKey}:`, e.message);
        }
      }
      
      console.log(`\n✅ Deleted ${deleted} orphaned assets`);
    } else {
      console.log('\nCancelled. No assets were deleted.');
    }
    
    rl.close();
  });
} else {
  console.log("\n✅ No orphaned assets found!");
}

