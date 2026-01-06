import { getStore } from "@netlify/blobs";
import JSZip from "jszip";

// Helper to check if a file should be skipped (macOS metadata, etc.)
function shouldSkipFile(path) {
  const fileName = path.split("/").pop();
  // Skip macOS resource forks (._filename), __MACOSX folder, .DS_Store, source maps
  return (
    fileName.startsWith("._") ||
    path.includes("__MACOSX/") ||
    fileName === ".DS_Store" ||
    fileName.endsWith(".map")
  );
}

export default async (req, context) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const formData = await req.formData();
    const zipFile = formData.get("file");
    const projectName = formData.get("name") || "Untitled Project";
    const clientName = formData.get("clientName") || "";
    const description = formData.get("description") || "";

    if (!zipFile) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Generate unique project ID
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get blob stores
    const projectsStore = getStore("projects");
    const assetsStore = getStore("assets");

    // Extract ZIP
    const zipBuffer = await zipFile.arrayBuffer();
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipBuffer);

    const pages = [];
    const assetKeys = [];

    // Process all files in ZIP
    for (const [path, zipEntry] of Object.entries(zipContent.files)) {
      if (zipEntry.dir) continue;

      // Skip macOS metadata files
      if (shouldSkipFile(path)) continue;

      const fileName = path.split("/").pop();
      const assetKey = `${projectId}/${path}`;

      if (path.toLowerCase().endsWith(".html")) {
        const content = await zipEntry.async("text");
        await assetsStore.set(assetKey, content, { metadata: { contentType: "text/html" } });
        pages.push({
          name: fileName,
          path: path,
          assetKey: assetKey,
        });
        assetKeys.push(assetKey);
      } else if (path.match(/\.(css|js|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
        const arrayBuffer = await zipEntry.async("arraybuffer");
        
        let contentType = "application/octet-stream";
        const ext = path.split(".").pop().toLowerCase();
        const mimeTypes = {
          css: "text/css",
          js: "application/javascript",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          svg: "image/svg+xml",
          webp: "image/webp",
          ico: "image/x-icon",
          woff: "font/woff",
          woff2: "font/woff2",
          ttf: "font/ttf",
          eot: "application/vnd.ms-fontobject",
        };
        contentType = mimeTypes[ext] || contentType;

        await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), { metadata: { contentType } });
        assetKeys.push(assetKey);
      }
    }

    // Create project metadata
    const project = {
      id: projectId,
      name: projectName,
      clientName: clientName,
      description: description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      pages: pages,
      assetKeys: assetKeys,
    };

    // Save project metadata
    await projectsStore.set(projectId, JSON.stringify(project), { metadata: { contentType: "application/json" } });

    // Update projects list
    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list", { type: "json" });
      if (existingList) projectsList = existingList;
    } catch (e) { /* List doesn't exist yet */ }

    projectsList.push({
      id: projectId,
      name: projectName,
      clientName: clientName,
      createdAt: project.createdAt,
      pageCount: pages.length,
    });
    await projectsStore.set("_list", JSON.stringify(projectsList), { metadata: { contentType: "application/json" } });

    return new Response(JSON.stringify({
      success: true,
      project: project,
      shareUrl: `/review/${projectId}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const config = {
  path: "/api/upload-project",
};

