// API Service for Opace Annotate
// Handles all communication with Netlify Functions backend

import JSZip from 'jszip';

const API_BASE = '/api';

// Version for cache busting
const API_VERSION = '2.0.9';

// MIME types for common file extensions
const MIME_TYPES = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
};

// Files to skip during upload (source maps, macOS metadata, etc.)
const SKIP_PATTERNS = [
  /\.map$/i,
  /\.DS_Store$/i,
  /thumbs\.db$/i,
  /__MACOSX\//i,
  /node_modules\//i,
  /\/\._[^/]+$/i,  // macOS resource forks (._filename)
  /^\._[^/]+$/i,   // macOS resource forks at root level
];

/**
 * Upload a project ZIP file
 * Uses single upload for files <4MB, chunked for larger
 * (Netlify has a 6MB payload limit, and FormData adds overhead)
 * @param {File} file - ZIP file to upload
 * @param {Object} metadata - Project metadata (name, clientName, description)
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} - Created project data
 */
export async function uploadProject(file, metadata, onProgress) {
  // For files under 4MB, use direct upload (faster)
  // Above 4MB, use chunked upload to avoid Netlify's 6MB payload limit
  if (file.size < 4 * 1024 * 1024) {
    return uploadProjectDirect(file, metadata, onProgress);
  }

  // For larger files, use chunked upload
  return uploadProjectChunked(file, metadata, onProgress);
}

/**
 * Upload image mockups grouped by page + viewport
 * @param {Array} assignments - [{ id, file, pageName, viewport }]
 * @param {Object} metadata - Project metadata (name, clientName, description)
 * @returns {Promise<Object>} - Created project data
 */
export async function uploadImages(assignments, metadata) {
  const formData = new FormData();
  formData.append('name', metadata.name || 'Untitled Project');
  formData.append('clientName', metadata.clientName || '');
  formData.append('description', metadata.description || '');

  const payload = assignments.map((assignment, index) => {
    const field = `file_${index}`;
    formData.append(field, assignment.file, assignment.file.name);
    return {
      id: assignment.id,
      pageName: assignment.pageName,
      viewport: assignment.viewport,
      fileField: field,
      originalName: assignment.file.name,
    };
  });

  formData.append('assignments', JSON.stringify(payload));

  const response = await fetch(`${API_BASE}/upload-images?v=${API_VERSION}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

/**
 * Direct upload for smaller files
 */
async function uploadProjectDirect(file, metadata, onProgress) {
  if (onProgress) onProgress(10);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', metadata.name || 'Untitled Project');
  formData.append('clientName', metadata.clientName || '');
  formData.append('description', metadata.description || '');

  if (onProgress) onProgress(30);

  const response = await fetch(`${API_BASE}/upload-project?v=${API_VERSION}`, {
    method: 'POST',
    body: formData,
  });

  if (onProgress) onProgress(90);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  if (onProgress) onProgress(100);
  return response.json();
}

/**
 * Chunked upload for larger files
 */
async function uploadProjectChunked(file, metadata, onProgress) {
  // Step 1: Extract ZIP client-side
  if (onProgress) onProgress(5);
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(file);

  // Collect files to upload (filter out unnecessary files)
  const filesToUpload = [];
  const skippedFiles = [];

  for (const [path, zipEntry] of Object.entries(zipContent.files)) {
    if (zipEntry.dir) continue;

    // Skip unwanted files
    if (SKIP_PATTERNS.some(pattern => pattern.test(path))) {
      console.log(`[CHUNKED] Skipping file (pattern match): ${path}`);
      continue;
    }

    const ext = path.split('.').pop().toLowerCase();
    if (MIME_TYPES[ext]) {
      filesToUpload.push({ path, zipEntry });
      console.log(`[CHUNKED] Will upload: ${path} (${ext})`);
    } else {
      skippedFiles.push(path);
      console.log(`[CHUNKED] Skipping file (unknown type): ${path} (ext: ${ext})`);
    }
  }

  console.log(`[CHUNKED] Total files to upload: ${filesToUpload.length}, Skipped: ${skippedFiles.length}`);
  if (onProgress) onProgress(10);

  // Step 2: Initialise project on server
  const initResponse = await fetch(`${API_BASE}/init-project?v=${API_VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: metadata.name || 'Untitled Project',
      clientName: metadata.clientName || '',
      description: metadata.description || '',
      fileCount: filesToUpload.length,
    }),
  });

  if (!initResponse.ok) {
    const error = await initResponse.json().catch(() => ({ error: 'Failed to initialise project' }));
    throw new Error(error.error || 'Failed to initialise project');
  }

  const { projectId } = await initResponse.json();

  // Step 3: Upload files with lower concurrency to avoid timeouts
  const BATCH_SIZE = 5; // Reduced from 10 to avoid overwhelming Netlify
  let uploadedCount = 0;
  const failedUploads = [];

  for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
    const batch = filesToUpload.slice(i, i + BATCH_SIZE);

    // Use Promise.allSettled instead of Promise.all to continue even if some fail
    const results = await Promise.allSettled(batch.map(async ({ path, zipEntry }) => {
      try {
        const ext = path.split('.').pop().toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const isHtml = ext === 'html' || ext === 'htm';

        const formData = new FormData();
        formData.append('projectId', projectId);
        formData.append('path', path);
        formData.append('contentType', contentType);
        formData.append('isHtml', isHtml.toString());

        if (isHtml || ext === 'css' || ext === 'js' || ext === 'json' || ext === 'svg') {
          const content = await zipEntry.async('text');
          formData.append('file', content);
        } else {
          const blob = await zipEntry.async('blob');
          formData.append('file', blob);
        }

        const uploadResponse = await fetch(`${API_BASE}/upload-file?v=${API_VERSION}`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          console.error(`[CHUNKED] Failed to upload ${path}:`, errorData);
          failedUploads.push(path);
          throw new Error(`Failed to upload ${path}: ${errorData.error || 'Unknown error'}`);
        }

        uploadedCount++;
        console.log(`[CHUNKED] Uploaded ${uploadedCount}/${filesToUpload.length}: ${path}`);

        if (onProgress) {
          onProgress(10 + Math.round((uploadedCount / filesToUpload.length) * 80));
        }

        return { success: true, path };
      } catch (error) {
        console.error(`[CHUNKED] Error uploading ${path}:`, error);
        failedUploads.push(path);
        return { success: false, path, error: error.message };
      }
    }));

    // Log results but don't throw - continue with remaining files
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`[CHUNKED] Upload rejected:`, result.reason);
      } else if (!result.value.success) {
        console.error(`[CHUNKED] Upload failed for ${result.value.path}:`, result.value.error);
      }
    });
  }

  // Step 4: Finalise project (even if some files failed)
  if (onProgress) onProgress(95);

  const finaliseResponse = await fetch(`${API_BASE}/finalise-project?v=${API_VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });

  if (!finaliseResponse.ok) {
    const error = await finaliseResponse.json().catch(() => ({ error: 'Failed to finalise project' }));
    throw new Error(error.error || 'Failed to finalise project');
  }

  if (onProgress) onProgress(100);

  const result = await finaliseResponse.json();

  // Add warning if some files failed
  if (failedUploads.length > 0) {
    console.warn(`[CHUNKED] Project created but ${failedUploads.length} files failed to upload:`, failedUploads);
    result.warning = `${failedUploads.length} file(s) failed to upload: ${failedUploads.slice(0, 5).join(', ')}${failedUploads.length > 5 ? '...' : ''}`;
    result.failedFiles = failedUploads;
  }

  return result;
}

/**
 * List all projects
 * @returns {Promise<Array>} - Array of project summaries
 */
export async function listProjects() {
  // Add timestamp to prevent caching after uploads/deletes
  const timestamp = Date.now();
  const response = await fetch(`${API_BASE}/projects?v=${API_VERSION}&t=${timestamp}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }

  const data = await response.json();
  return data.projects || [];
}

/**
 * Get a specific project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>} - Full project data
 */
export async function getProject(projectId) {
  const timestamp = Date.now();
  const response = await fetch(`${API_BASE}/project/${projectId}?v=${API_VERSION}&t=${timestamp}`, {
    cache: 'no-store',
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Project not found');
    }
    throw new Error('Failed to fetch project');
  }

  return response.json();
}

/**
 * Delete a project
 * @param {string} projectId - Project ID to delete
 * @returns {Promise<Object>} - Deletion confirmation
 */
export async function deleteProject(projectId) {
  const response = await fetch(`${API_BASE}/project/${projectId}?v=${API_VERSION}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }

  return response.json();
}

/**
 * Get asset URL for a project file
 * @param {string} projectId - Project ID
 * @param {string} assetPath - Path to the asset within the project
 * @returns {string} - URL to fetch the asset
 */
export function getAssetUrl(projectId, assetPath) {
  return `${API_BASE}/asset/${projectId}/${assetPath}?v=${API_VERSION}`;
}

/**
 * Get comments for a project page
 * @param {string} projectId - Project ID
 * @param {string} pageKey - Optional page key for page-specific comments
 * @returns {Promise<Array>} - Array of comments
 */
export async function getComments(projectId, pageKey = null) {
  const params = new URLSearchParams({ v: API_VERSION });
  if (pageKey) params.append('pageKey', pageKey);
  
  const response = await fetch(`${API_BASE}/comments/${projectId}?${params}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch comments');
  }

  const data = await response.json();
  return data.comments || [];
}

/**
 * Save comments for a project page
 * @param {string} projectId - Project ID
 * @param {Array} comments - Array of comment objects
 * @param {string} pageKey - Optional page key for page-specific comments
 * @returns {Promise<Object>} - Save confirmation
 */
export async function saveComments(projectId, comments, pageKey = null) {
  const params = new URLSearchParams({ v: API_VERSION });
  if (pageKey) params.append('pageKey', pageKey);
  
  const response = await fetch(`${API_BASE}/comments/${projectId}?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comments }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save comments');
  }

  return response.json();
}

/**
 * Generate a shareable URL for a project
 * @param {string} projectId - Project ID
 * @returns {string} - Full shareable URL
 */
export function getShareUrl(projectId) {
  const baseUrl = window.location.origin;
  return `${baseUrl}/review/${projectId}`;
}

export default {
  uploadProject,
  uploadImages,
  listProjects,
  getProject,
  deleteProject,
  getAssetUrl,
  getComments,
  saveComments,
  getShareUrl,
};
