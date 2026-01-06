import { getStore } from "@netlify/blobs";

// Version for cache busting
const API_VERSION = "2.0.7";

// Helper to check if HTML has meaningful body content
function hasBodyContent(html) {
  if (!html || typeof html !== 'string') return false;

  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return false;

  let bodyContent = bodyMatch[1];

  // Remove script tags
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove empty divs like <div id="app"></div>
  bodyContent = bodyContent.replace(/<div[^>]*>\s*<\/div>/gi, '');
  // Remove comments
  bodyContent = bodyContent.replace(/<!--[\s\S]*?-->/g, '');
  // Remove whitespace
  bodyContent = bodyContent.replace(/\s+/g, '').trim();

  // Check if there's any meaningful content left
  return bodyContent.length > 10;
}

export default async (req, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId");
    const filePath = formData.get("path");
    const file = formData.get("file");
    const contentType = formData.get("contentType") || "application/octet-stream";
    const isHtml = formData.get("isHtml") === "true";

    console.log(`[UPLOAD-FILE] Uploading: ${filePath} (${contentType}, isHtml: ${isHtml})`);

    if (!projectId || !filePath || !file) {
      console.error(`[UPLOAD-FILE] Missing fields - projectId: ${!!projectId}, filePath: ${!!filePath}, file: ${!!file}`);
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const projectsStore = getStore("projects");
    const assetsStore = getStore("assets");

    // Get project
    const projectData = await projectsStore.get(projectId, { type: "json" });
    if (!projectData) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assetKey = `${projectId}/${filePath}`;

    // Store the file
    if (typeof file === "string") {
      await assetsStore.set(assetKey, file, { metadata: { contentType } });
    } else {
      const arrayBuffer = await file.arrayBuffer();
      await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), { metadata: { contentType } });
    }

    // Update project metadata
    projectData.uploadedFiles = (projectData.uploadedFiles || 0) + 1;
    projectData.assetKeys.push(assetKey);

    if (isHtml) {
      // Only add pages with meaningful body content
      const fileContent = typeof file === 'string' ? file : await file.text?.() || '';
      const hasContent = hasBodyContent(fileContent);
      console.log(`[UPLOAD-FILE] HTML file ${filePath} has body content: ${hasContent}`);

      if (hasContent) {
        const fileName = filePath.split("/").pop();
        projectData.pages.push({
          name: fileName,
          path: filePath,
          assetKey: assetKey,
        });
        console.log(`[UPLOAD-FILE] Added page: ${fileName}`);
      } else {
        console.log(`[UPLOAD-FILE] Skipped page (no body content): ${filePath}`);
      }
    }

    await projectsStore.set(projectId, JSON.stringify(projectData), {
      metadata: { contentType: "application/json" },
    });

    return new Response(JSON.stringify({
      success: true,
      assetKey: assetKey,
      uploadedCount: projectData.uploadedFiles,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Upload file error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/upload-file",
};

