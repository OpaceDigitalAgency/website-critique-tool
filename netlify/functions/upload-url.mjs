import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const API_VERSION = "1.0.1";
const MAX_ASSET_COUNT = 120;
const MAX_ASSET_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_TIME_MS = 8000;
const PAGE_FETCH_TIMEOUT_MS = 6000;
const ASSET_FETCH_TIMEOUT_MS = 3500;

const MIME_TYPES = {
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
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

const ASSET_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

const isSkippableUrl = (value) => {
  if (!value) return true;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  );
};

const normalizeInputUrl = (value) => {
  try {
    return new URL(value);
  } catch (error) {
    return new URL(`https://${value}`);
  }
};

const extractTitle = (html) => {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  const title = match[1]?.trim();
  return title || null;
};

const stripBaseTag = (html) => html.replace(/<base[^>]*>/i, "");

const collectHtmlUrls = (html) => {
  const urls = [];
  html.replace(/\b(?:src|href)=["']([^"']+)["']/gi, (_, value) => {
    urls.push(value);
    return "";
  });
  html.replace(/\bsrcset=["']([^"']+)["']/gi, (_, value) => {
    value.split(",").forEach((entry) => {
      const part = entry.trim();
      if (!part) return;
      const [url] = part.split(/\s+/);
      if (url) urls.push(url);
    });
    return "";
  });
  return urls;
};

const collectCssUrls = (css) => {
  const urls = [];
  css.replace(/@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?/gi, (_, value) => {
    urls.push(value);
    return "";
  });
  css.replace(/url\(["']?([^"')]+)["']?\)/gi, (_, value) => {
    urls.push(value);
    return "";
  });
  return urls;
};

const getExtension = (pathname) => {
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
};

const addHashSuffix = (path, urlString) => {
  const hash = createHash("sha1").update(urlString).digest("hex").slice(0, 8);
  const extMatch = path.match(/\.([a-z0-9]+)$/i);
  if (!extMatch) {
    return `${path}__${hash}`;
  }
  const ext = extMatch[1];
  const base = path.slice(0, -(ext.length + 1));
  return `${base}__${hash}.${ext}`;
};

const toAssetPath = (assetUrl, siteOrigin) => {
  const sameOrigin = assetUrl.origin === siteOrigin;
  const prefix = sameOrigin ? "" : `external/${assetUrl.hostname}`;
  let path = assetUrl.pathname || "/";
  if (path.endsWith("/")) path += "index";
  path = path.replace(/^\/+/, "");
  if (!path) path = "index";
  if (assetUrl.search || assetUrl.hash) {
    path = addHashSuffix(path, assetUrl.toString());
  }
  return prefix ? `${prefix}/${path}` : path;
};

const resolveUrl = (raw, baseUrl) => {
  if (raw.startsWith("//")) {
    return new URL(`https:${raw}`);
  }
  return new URL(raw, baseUrl);
};

const rewriteHtml = (html, baseUrl, assetMap) => {
  const rewriteUrl = (raw) => {
    if (isSkippableUrl(raw)) return null;
    try {
      const absolute = resolveUrl(raw, baseUrl);
      const mapped = assetMap.get(absolute.toString());
      if (!mapped) return null;
      return `/${mapped}`;
    } catch (error) {
      return null;
    }
  };

  let output = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
    const rewritten = rewriteUrl(value);
    return rewritten ? `${attr}="${rewritten}"` : match;
  });

  output = output.replace(/\bsrcset=["']([^"']+)["']/gi, (match, value) => {
    const rewritten = value
      .split(",")
      .map((entry) => {
        const part = entry.trim();
        if (!part) return part;
        const [url, ...rest] = part.split(/\s+/);
        const replaced = rewriteUrl(url) || url;
        return [replaced, ...rest].filter(Boolean).join(" ");
      })
      .join(", ");
    return `srcset="${rewritten}"`;
  });

  output = output.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, value) => {
    const rewritten = rewriteUrl(value);
    return rewritten ? `url("${rewritten}")` : match;
  });

  return output;
};

const isAcceptableAsset = (ext, contentType) => {
  if (ext && ASSET_EXTENSIONS.has(ext)) return true;
  if (!contentType) return false;
  return (
    contentType.startsWith("text/css") ||
    contentType.startsWith("application/javascript") ||
    contentType.startsWith("text/javascript") ||
    contentType.startsWith("image/") ||
    contentType.startsWith("font/")
  );
};

const fetchWithTimeout = async (url, timeoutMs, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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
    const payload = await req.json();
    const inputUrl = payload?.url;
    if (!inputUrl) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const projectName = payload?.name || "Untitled Project";
    const clientName = payload?.clientName || "";
    const description = payload?.description || "";

    const requestUrl = normalizeInputUrl(inputUrl);
    const startTime = Date.now();
    let pageResponse;
    try {
      pageResponse = await fetchWithTimeout(requestUrl, PAGE_FETCH_TIMEOUT_MS, {
        redirect: "follow",
        headers: {
          "User-Agent": "OpaceAnnotateBot/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Timed out fetching the website URL." }), {
        status: 408,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!pageResponse.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch URL (${pageResponse.status})` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const finalUrl = new URL(pageResponse.url);
    const siteOrigin = finalUrl.origin;
    let htmlContent = await pageResponse.text();

    const pageTitle = extractTitle(htmlContent) || finalUrl.hostname;
    htmlContent = stripBaseTag(htmlContent);

    const urlPath = finalUrl.pathname || "/";
    const hasExtension = /\.[a-z0-9]+$/i.test(urlPath);
    let pagePath = urlPath.endsWith("/")
      ? `${urlPath}index.html`
      : hasExtension
      ? urlPath
      : `${urlPath}/index.html`;
    pagePath = pagePath.replace(/^\/+/, "");
    if (finalUrl.search || finalUrl.hash) {
      pagePath = addHashSuffix(pagePath, finalUrl.toString());
    }

    const assetsStore = getStore("assets");
    const projectsStore = getStore("projects");
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const assetKeys = [];

    const rawUrls = collectHtmlUrls(htmlContent);
    const queue = [];
    const seen = new Set();
    const assetMap = new Map();

    for (const raw of rawUrls) {
      if (isSkippableUrl(raw)) continue;
      try {
        const absolute = resolveUrl(raw, finalUrl);
        queue.push(absolute.toString());
      } catch (error) {
        // Ignore invalid URLs.
      }
    }

    while (queue.length > 0 && assetKeys.length < MAX_ASSET_COUNT) {
      if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
        break;
      }
      const current = queue.shift();
      if (!current || seen.has(current)) continue;
      seen.add(current);

      let assetUrl;
      try {
        assetUrl = new URL(current);
      } catch (error) {
        continue;
      }

      if (!["http:", "https:"].includes(assetUrl.protocol)) {
        continue;
      }

      const ext = getExtension(assetUrl.pathname);
      if (!ext || !ASSET_EXTENSIONS.has(ext)) {
        continue;
      }

      const assetPath = toAssetPath(assetUrl, siteOrigin);
      const assetKey = `${projectId}/${assetPath}`;
      if (assetMap.has(assetUrl.toString())) {
        continue;
      }

      let assetResponse;
      try {
        assetResponse = await fetchWithTimeout(assetUrl.toString(), ASSET_FETCH_TIMEOUT_MS, {
          redirect: "follow",
        });
      } catch (error) {
        continue;
      }
      if (!assetResponse.ok) {
        continue;
      }

      const contentLength = Number(assetResponse.headers.get("content-length") || 0);
      if (contentLength && contentLength > MAX_ASSET_BYTES) {
        continue;
      }

      const contentType = assetResponse.headers.get("content-type") || MIME_TYPES[ext] || "application/octet-stream";
      if (!isAcceptableAsset(ext, contentType)) {
        continue;
      }

      if (contentType.startsWith("text/") || ext === "css" || ext === "js" || ext === "svg") {
        const text = await assetResponse.text();
        await assetsStore.set(assetKey, text, { metadata: { contentType } });
        assetKeys.push(assetKey);
        assetMap.set(assetUrl.toString(), assetPath);

        if (ext === "css") {
          const cssUrls = collectCssUrls(text);
          for (const cssUrl of cssUrls) {
            if (isSkippableUrl(cssUrl)) continue;
            try {
              const absoluteCss = resolveUrl(cssUrl, assetUrl);
              queue.push(absoluteCss.toString());
            } catch (error) {
              // Ignore invalid URLs.
            }
          }
        }
      } else {
        const buffer = await assetResponse.arrayBuffer();
        if (buffer.byteLength > MAX_ASSET_BYTES) {
          continue;
        }
        await assetsStore.set(assetKey, new Uint8Array(buffer), { metadata: { contentType } });
        assetKeys.push(assetKey);
        assetMap.set(assetUrl.toString(), assetPath);
      }
    }

    const rewrittenHtml = rewriteHtml(htmlContent, finalUrl, assetMap);
    const pageAssetKey = `${projectId}/${pagePath}`;
    await assetsStore.set(pageAssetKey, rewrittenHtml, {
      metadata: { contentType: "text/html" },
    });
    assetKeys.push(pageAssetKey);

    const project = {
      id: projectId,
      name: projectName,
      clientName: clientName,
      description: description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      type: "url",
      sourceUrl: finalUrl.toString(),
      pages: [
        {
          name: pageTitle,
          path: pagePath,
          assetKey: pageAssetKey,
        },
      ],
      assetKeys: assetKeys,
    };

    await projectsStore.set(projectId, JSON.stringify(project), {
      metadata: { contentType: "application/json" },
    });

    let projectsList = [];
    try {
      const existingList = await projectsStore.get("_list", { type: "json" });
      if (existingList) projectsList = existingList;
    } catch (error) {
      // No existing list.
    }

    projectsList.push({
      id: projectId,
      name: projectName,
      clientName: clientName,
      createdAt: project.createdAt,
      pageCount: project.pages.length,
      type: "url",
    });

    await projectsStore.set("_list", JSON.stringify(projectsList), {
      metadata: { contentType: "application/json" },
    });

    return new Response(
      JSON.stringify({
        success: true,
        project,
        shareUrl: `/review/${projectId}?v=${API_VERSION}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("[UPLOAD-URL] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "URL upload failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

export const config = {
  path: "/api/upload-url",
};
