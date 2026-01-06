import { getStore } from "@netlify/blobs";

const projectId = "proj_1767719707168_hbt45nuj2";

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

console.log("Fetching project data...");
const projectData = await projectsStore.get(projectId, { type: "json" });

console.log("\n=== PROJECT DATA ===");
console.log("Project ID:", projectData.id);
console.log("Project Name:", projectData.name);
console.log("Total Files:", projectData.fileCount);
console.log("Uploaded Files:", projectData.uploadedFiles);
console.log("Total Asset Keys:", projectData.assetKeys?.length || 0);
console.log("Total Pages:", projectData.pages?.length || 0);

console.log("\n=== PAGES ===");
if (projectData.pages) {
  projectData.pages.forEach((page, i) => {
    console.log(`${i + 1}. ${page.name} - ${page.path}`);
  });
}

console.log("\n=== ALL ASSET KEYS ===");
if (projectData.assetKeys) {
  projectData.assetKeys.forEach((key, i) => {
    console.log(`${i + 1}. ${key}`);
  });
}

console.log("\n=== CHECKING HTML FILES IN ASSETS ===");
if (projectData.assetKeys) {
  for (const key of projectData.assetKeys) {
    if (key.endsWith('.html')) {
      const content = await assetsStore.get(key, { type: "text" });
      console.log(`\n${key}:`);
      console.log(`  - Size: ${content?.length || 0} bytes`);
      console.log(`  - Has content: ${!!content}`);
      if (content) {
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        console.log(`  - Has body tag: ${!!bodyMatch}`);
        if (bodyMatch) {
          const bodyContent = bodyMatch[1].replace(/\s+/g, '').trim();
          console.log(`  - Body content length: ${bodyContent.length}`);
        }
      }
    }
  }
}

