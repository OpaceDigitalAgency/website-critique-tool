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

console.log("=== DELETE ALL NETLIFY BLOBS ===\n");
console.log("⚠️  WARNING: This will delete ALL blobs from both stores!");
console.log("This action cannot be undone.\n");

// Get counts first
const { blobs: projectBlobs } = await projectsStore.list();
const { blobs: assetBlobs } = await assetsStore.list();

console.log(`Projects store: ${projectBlobs.length} blobs`);
console.log(`Assets store: ${assetBlobs.length} blobs`);
console.log(`Total: ${projectBlobs.length + assetBlobs.length} blobs\n`);

if (projectBlobs.length === 0 && assetBlobs.length === 0) {
  console.log("✅ No blobs found. Stores are already clean!");
  process.exit(0);
}

// Read user confirmation
const readline = await import('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Type "DELETE ALL" to confirm deletion: ', async (answer) => {
  if (answer === 'DELETE ALL') {
    console.log('\n🗑️  Starting deletion...\n');
    
    let deletedProjects = 0;
    let deletedAssets = 0;
    let failedProjects = 0;
    let failedAssets = 0;
    
    // Delete all projects
    if (projectBlobs.length > 0) {
      console.log(`Deleting ${projectBlobs.length} project blobs...`);
      for (const blob of projectBlobs) {
        try {
          await projectsStore.delete(blob.key);
          deletedProjects++;
          if (deletedProjects % 10 === 0) {
            console.log(`  Deleted ${deletedProjects}/${projectBlobs.length} projects...`);
          }
        } catch (e) {
          console.error(`  ❌ Failed to delete project ${blob.key}:`, e.message);
          failedProjects++;
        }
      }
      console.log(`✅ Deleted ${deletedProjects} project blobs (${failedProjects} failed)\n`);
    }
    
    // Delete all assets
    if (assetBlobs.length > 0) {
      console.log(`Deleting ${assetBlobs.length} asset blobs...`);
      for (const blob of assetBlobs) {
        try {
          await assetsStore.delete(blob.key);
          deletedAssets++;
          if (deletedAssets % 100 === 0) {
            console.log(`  Deleted ${deletedAssets}/${assetBlobs.length} assets...`);
          }
        } catch (e) {
          console.error(`  ❌ Failed to delete asset ${blob.key}:`, e.message);
          failedAssets++;
        }
      }
      console.log(`✅ Deleted ${deletedAssets} asset blobs (${failedAssets} failed)\n`);
    }
    
    // Summary
    console.log("=== DELETION COMPLETE ===");
    console.log(`Total deleted: ${deletedProjects + deletedAssets}`);
    console.log(`Total failed: ${failedProjects + failedAssets}`);
    console.log("\n✅ Netlify blob stores have been cleaned!");
    
  } else {
    console.log('\n❌ Cancelled. No blobs were deleted.');
  }
  
  rl.close();
});

