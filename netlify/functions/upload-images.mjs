import { getStore } from "@netlify/blobs";

const VIEWPORTS = new Set(["desktop", "tablet", "mobile"]);

const MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const slugify = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const getExtension = (fileName, contentType) => {
  if (fileName && fileName.includes(".")) {
    return fileName.split(".").pop().toLowerCase();
  }

  if (contentType) {
    const match = Object.entries(MIME_TYPES).find(([, type]) => type === contentType);
    if (match) return match[0];
  }

  return "png";
};

export default async (req) => {
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
    const projectName = formData.get("name") || "Untitled Project";
    const clientName = formData.get("clientName") || "";
    const description = formData.get("description") || "";
    const assignmentsRaw = formData.get("assignments");

    if (!assignmentsRaw) {
      return new Response(JSON.stringify({ error: "Image assignments required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assignmentsText =
      typeof assignmentsRaw === "string"
        ? assignmentsRaw
        : typeof assignmentsRaw?.text === "function"
        ? await assignmentsRaw.text()
        : "";

    let assignments;
    try {
      assignments = JSON.parse(assignmentsText);
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid assignments payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const projectsStore = getStore("projects");
    const assetsStore = getStore("assets");

    const pagesMap = new Map();
    const assetKeys = [];

    for (const assignment of assignments) {
      const pageName = (assignment.pageName || "Untitled Page").trim();
      const slug = slugify(pageName) || "page";
      const viewport = (assignment.viewport || "desktop").toLowerCase();

      if (!VIEWPORTS.has(viewport)) {
        return new Response(JSON.stringify({ error: `Invalid viewport: ${viewport}` }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const fileField = assignment.fileField;
      const file = formData.get(fileField);

      if (!file || typeof file.arrayBuffer !== "function") {
        return new Response(JSON.stringify({ error: `Missing image data for ${pageName}` }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const fileName = file.name || assignment.originalName || `${slug}-${viewport}`;
      const ext = getExtension(fileName, file.type);
      const assetPath = `images/${slug}/${viewport}.${ext}`;
      const assetKey = `${projectId}/${assetPath}`;
      const contentType = file.type || MIME_TYPES[ext] || "application/octet-stream";

      const arrayBuffer = await file.arrayBuffer();
      await assetsStore.set(assetKey, new Uint8Array(arrayBuffer), {
        metadata: { contentType },
      });

      assetKeys.push(assetKey);

      if (!pagesMap.has(slug)) {
        pagesMap.set(slug, {
          name: pageName,
          path: `images/${slug}`,
          variants: {},
        });
      }

      const pageEntry = pagesMap.get(slug);
      pageEntry.variants[viewport] = {
        path: assetPath,
        fileName: fileName,
      };
    }

    const pages = Array.from(pagesMap.values());

    const project = {
      id: projectId,
      name: projectName,
      clientName: clientName,
      description: description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      type: "images",
      pages: pages,
      assetKeys: assetKeys,
    };

    await projectsStore.set(projectId, JSON.stringify(project), {
      metadata: { contentType: "application/json" },
    });

    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list", { type: "json" });
      if (existingList) projectsList = existingList;
    } catch (e) {
      // No existing list.
    }

    projectsList.push({
      id: projectId,
      name: projectName,
      clientName: clientName,
      createdAt: project.createdAt,
      pageCount: pages.length,
      type: "images",
    });

    await projectsStore.set("_list", JSON.stringify(projectsList), {
      metadata: { contentType: "application/json" },
    });

    return new Response(
      JSON.stringify({
        success: true,
        project: project,
        shareUrl: `/review/${projectId}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Upload images error:", error);
    return new Response(JSON.stringify({ error: error.message || "Upload failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

export const config = {
  path: "/api/upload-images",
};
