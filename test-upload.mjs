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

// Test uploading a simple HTML file
const testHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a test page.</p>
</body>
</html>`;

const testProjectId = `test_${Date.now()}`;
const assetKey = `${testProjectId}/test.html`;

console.log("Uploading test HTML file...");
console.log("Asset key:", assetKey);

try {
  await assetsStore.set(assetKey, testHtml, { 
    metadata: { contentType: "text/html" } 
  });
  console.log("✅ Upload successful!");
  
  // Verify it was uploaded
  const retrieved = await assetsStore.get(assetKey, { type: "text" });
  console.log("✅ Retrieved successfully!");
  console.log("Content length:", retrieved.length);
  console.log("Content matches:", retrieved === testHtml);
  
  // Create project metadata
  const project = {
    id: testProjectId,
    name: "Test Project",
    createdAt: new Date().toISOString(),
    pages: [{
      name: "test.html",
      path: "test.html",
      assetKey: assetKey
    }],
    assetKeys: [assetKey]
  };
  
  console.log("\nSaving project metadata...");
  await projectsStore.set(testProjectId, JSON.stringify(project), {
    metadata: { contentType: "application/json" }
  });
  console.log("✅ Project metadata saved!");
  
  // Update _list
  let projectsList = [];
  try {
    const existing = await projectsStore.get("_list", { type: "json" });
    if (existing) projectsList = existing;
  } catch (e) {}
  
  projectsList.push({
    id: testProjectId,
    name: "Test Project",
    createdAt: project.createdAt,
    pageCount: 1
  });
  
  await projectsStore.set("_list", JSON.stringify(projectsList), {
    metadata: { contentType: "application/json" }
  });
  console.log("✅ Projects list updated!");
  
  console.log("\n=== TEST COMPLETE ===");
  console.log("Project ID:", testProjectId);
  console.log("You can now check if this appears in the app!");
  
} catch (error) {
  console.error("❌ Error:", error);
}

