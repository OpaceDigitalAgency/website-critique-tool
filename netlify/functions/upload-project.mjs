import { getStore } from "@netlify/blobs";
import JSZip from "jszip";

// Version for cache busting
const API_VERSION = "2.0.5";

// Helper to check if a file should be skipped (macOS metadata, etc.)
function shouldSkipFile(path) {
  const fileName = path.split("/").pop();
  // Skip macOS resource forks (._filename), __MACOSX folder, .DS_Store, source maps, node_modules
  return (
    fileName.startsWith("._") ||
    path.includes("__MACOSX/") ||
    path.includes("node_modules/") ||
    fileName === ".DS_Store" ||
    fileName.endsWith(".map")
  );
}

// Helper to check if HTML has meaningful body content
function hasBodyContent(html) {
  if (!html || typeof html !== 'string') return false;

  // Just check if there's a body tag with some content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return false;

  // Remove whitespace and check if there's anything left
  const bodyContent = bodyMatch[1].trim();
  return bodyContent.length > 0;
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
      if (shouldSkipFile(path)) {
        console.log(`[UPLOAD] Skipping file (metadata): ${path}`);
        continue;
      }

      const fileName = path.split("/").pop();
      const assetKey = `${projectId}/${path}`;

      console.log(`[UPLOAD] Processing file: ${path}`);

      if (path.toLowerCase().endsWith(".html")) {
        const content = await zipEntry.async("text");

        // Only add pages with meaningful body content
        const hasContent = hasBodyContent(content);
        console.log(`[UPLOAD] HTML file: ${path}, hasContent: ${hasContent}, size: ${content.length}`);

        if (hasContent) {
          await assetsStore.set(assetKey, content, { metadata: { contentType: "text/html" } });
          pages.push({
            name: fileName,
            path: path,
            assetKey: assetKey,
          });
          assetKeys.push(assetKey);
        } else {
          console.log(`[UPLOAD] Skipping ${path} - no body content detected`);
        }
      } else if (path.match(/\.(css|js|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
        const ext = path.split(".").pop().toLowerCase();
        console.log(`[UPLOAD] Asset file detected: ${path}, ext: ${ext}`);

        let contentType = "application/octet-stream";
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

        // Upload text files as text, binary files as binary
        if (ext === 'css' || ext === 'js' || ext === 'svg') {
          const content = await zipEntry.async("text");
          console.log(`[UPLOAD] Uploading text asset: ${assetKey}, size: ${content.length}, contentType: ${contentType}`);
          await assetsStore.set(assetKey, content, { metadata: { contentType } });
        } else {
          const arrayBuffer = await zipEntry.async("arraybuffer");
          console.log(`[UPLOAD] Uploading binary asset: ${assetKey}, size: ${arrayBuffer.byteLength}, contentType: ${contentType}`);
          await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), { metadata: { contentType } });
        }

        assetKeys.push(assetKey);
        console.log(`[UPLOAD] Asset uploaded successfully: ${assetKey}`);
      } else {
        console.log(`[UPLOAD] Skipping file (unknown type): ${path}`);
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

    console.log(`[UPLOAD] Creating project metadata:`, {
      id: projectId,
      name: projectName,
      pageCount: pages.length,
      assetCount: assetKeys.length
    });

    // Save project metadata
    console.log(`[UPLOAD] Saving project to blob store...`);
    await projectsStore.set(projectId, JSON.stringify(project), { metadata: { contentType: "application/json" } });
    console.log(`[UPLOAD] Project metadata saved successfully`);

    // Verify it was saved
    const savedProject = await projectsStore.get(projectId, { type: "json" });
    console.log(`[UPLOAD] Verification: Project retrieved from store:`, savedProject ? "YES" : "NO");

    // Update projects list
    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list", { type: "json" });
      if (existingList) projectsList = existingList;
      console.log(`[UPLOAD] Existing projects list has ${projectsList.length} projects`);
    } catch (e) {
      console.log(`[UPLOAD] No existing projects list found`);
    }

    projectsList.push({
      id: projectId,
      name: projectName,
      clientName: clientName,
      createdAt: project.createdAt,
      pageCount: pages.length,
    });
    console.log(`[UPLOAD] Updating projects list with ${projectsList.length} projects`);
    await projectsStore.set("_list", JSON.stringify(projectsList), { metadata: { contentType: "application/json" } });
    console.log(`[UPLOAD] Projects list updated successfully`);

    return new Response(JSON.stringify({
      success: true,
      project: project,
      shareUrl: `/review/${projectId}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    console.error("[UPLOAD] Upload error:", error);
    console.error("[UPLOAD] Error stack:", error.stack);
    return new Response(JSON.stringify({
      error: error.message || "Upload failed",
      details: error.stack
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const config = {
  path: "/api/upload-project",
};

