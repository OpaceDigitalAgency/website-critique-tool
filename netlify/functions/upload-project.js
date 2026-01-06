import { getStore } from "@netlify/blobs";
import JSZip from "jszip";

export default async (req, context) => {
  // Handle CORS
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

    // Process all files
    for (const [path, zipEntry] of Object.entries(zipContent.files)) {
      if (zipEntry.dir) continue;

      const fileName = path.split("/").pop();
      const assetKey = `${projectId}/${path}`;

      if (path.endsWith(".html")) {
        const content = await zipEntry.async("text");
        await assetsStore.set(assetKey, content, { metadata: { type: "text/html" } });
        pages.push({
          name: fileName,
          path: path,
          assetKey: assetKey,
        });
        assetKeys.push(assetKey);
      } else if (path.match(/\.(css|js|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
        const blob = await zipEntry.async("blob");
        const arrayBuffer = await blob.arrayBuffer();
        
        let contentType = "application/octet-stream";
        if (path.endsWith(".css")) contentType = "text/css";
        else if (path.endsWith(".js")) contentType = "application/javascript";
        else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (path.endsWith(".png")) contentType = "image/png";
        else if (path.endsWith(".gif")) contentType = "image/gif";
        else if (path.endsWith(".svg")) contentType = "image/svg+xml";
        else if (path.endsWith(".webp")) contentType = "image/webp";
        else if (path.endsWith(".ico")) contentType = "image/x-icon";
        else if (path.endsWith(".woff")) contentType = "font/woff";
        else if (path.endsWith(".woff2")) contentType = "font/woff2";
        else if (path.endsWith(".ttf")) contentType = "font/ttf";
        else if (path.endsWith(".eot")) contentType = "application/vnd.ms-fontobject";

        await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), { metadata: { type: contentType } });
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
    await projectsStore.set(projectId, JSON.stringify(project), { metadata: { type: "application/json" } });

    // Add to projects list
    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list");
      if (existingList) {
        projectsList = JSON.parse(existingList);
      }
    } catch (e) {
      // List doesn't exist yet
    }
    projectsList.push({
      id: projectId,
      name: projectName,
      clientName: clientName,
      createdAt: project.createdAt,
      pageCount: pages.length,
    });
    await projectsStore.set("_list", JSON.stringify(projectsList), { metadata: { type: "application/json" } });

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

