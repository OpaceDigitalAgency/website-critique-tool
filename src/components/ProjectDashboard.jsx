import { useState, useRef, useMemo } from 'react'
import JSZip from 'jszip'
import {
  Upload, Globe, Plus, Trash2, Eye, Check, Link, Image, FileCode,
  FolderArchive, MoreHorizontal, Clock, Users, Search, Grid3X3, List,
  X, ChevronRight
} from 'lucide-react'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '3.3.0'

const IMAGE_VIEWPORTS = [
  { key: 'desktop', label: 'Desktop' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'mobile', label: 'Mobile' },
]

const VIEWPORT_TOKENS = {
  desktop: ['desktop', 'desk', 'web', 'pc'],
  tablet: ['tablet', 'tab'],
  mobile: ['mobile', 'phone', 'mob'],
}

const IMAGE_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

const MAX_IMAGE_SIZE_MB = 4
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
const COMPRESSION_QUALITY = 0.86
const COMPRESSION_SCALES = [1, 0.92, 0.85, 0.78, 0.7, 0.6, 0.5]

const loadImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

const canvasToBlob = (canvas, type, quality) => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

const compressImageFile = async (file, maxBytes) => {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= maxBytes) return file

  const img = await loadImage(file)
  const outputType = file.type === 'image/webp'
    ? 'image/webp'
    : file.type === 'image/jpeg'
      ? 'image/jpeg'
      : file.type === 'image/png'
        ? 'image/png'
        : 'image/jpeg'

  const compressWith = async (type, quality, fillBackground = false) => {
    for (const scale of COMPRESSION_SCALES) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (fillBackground) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const blob = await canvasToBlob(canvas, type, quality)
      if (!blob) continue
      const nextFile = new File([blob], file.name, {
        type: blob.type || type,
        lastModified: Date.now(),
      })
      if (nextFile.size <= maxBytes) {
        return nextFile
      }
    }
    return null
  }

  const primary = await compressWith(outputType, COMPRESSION_QUALITY)
  if (primary) return primary

  if (outputType === 'image/png') {
    const jpegFallback = await compressWith('image/jpeg', 0.8, true)
    if (jpegFallback) return jpegFallback
  }

  return file
}

const titleCase = (value) => {
  return value
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const inferViewport = (fileName) => {
  const lowerName = fileName.toLowerCase()
  for (const [viewport, tokens] of Object.entries(VIEWPORT_TOKENS)) {
    for (const token of tokens) {
      const regex = new RegExp(`(^|[\\s._-])${token}([\\s._-]|$)`, 'i')
      if (regex.test(lowerName)) {
        return viewport
      }
    }
  }
  return 'desktop'
}

const inferPageName = (fileName) => {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
  const normalized = nameWithoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const viewportTokens = Object.values(VIEWPORT_TOKENS).flat().join('|')
  const withoutViewport = normalized
    .replace(new RegExp(`\\b(${viewportTokens})\\b`, 'ig'), '')
    .replace(/\s+/g, ' ')
    .trim()
  const baseName = withoutViewport || normalized || 'Page'
  return titleCase(baseName)
}

const slugifyPageName = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const getFileExtension = (fileName) => {
  if (!fileName || !fileName.includes('.')) return ''
  return fileName.split('.').pop().toLowerCase()
}

const isZipFile = (file) => file?.name?.toLowerCase().endsWith('.zip')

const shouldSkipZipPath = (path) => {
  if (!path) return true
  const normalized = path.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() || ''
  return normalized.includes('__MACOSX/') || fileName.startsWith('._')
}

const inferViewportFromPath = (filePath, fileName) => {
  const normalized = (filePath || '').toLowerCase().replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  for (const [viewport, tokens] of Object.entries(VIEWPORT_TOKENS)) {
    for (const token of tokens) {
      if (segments.includes(token)) {
        return viewport
      }
    }
  }
  return inferViewport(fileName || filePath || '')
}

const classifyZipContents = async (file) => {
  const zip = new JSZip()
  const zipContent = await zip.loadAsync(file)
  let hasHtml = false
  let hasImages = false

  for (const [path, entry] of Object.entries(zipContent.files)) {
    if (entry.dir) continue
    if (shouldSkipZipPath(path)) continue
    const ext = getFileExtension(path)
    if (ext === 'html' || ext === 'htm') {
      hasHtml = true
      break
    }
    if (IMAGE_MIME_TYPES[ext]) {
      hasImages = true
    }
  }

  if (hasHtml) return 'zip'
  if (hasImages) return 'images'
  return 'zip'
}

const extractImagesFromZip = async (file) => {
  const zip = new JSZip()
  const zipContent = await zip.loadAsync(file)
  const images = []

  for (const [path, entry] of Object.entries(zipContent.files)) {
    if (entry.dir) continue
    if (shouldSkipZipPath(path)) continue
    const ext = getFileExtension(path)
    const mimeType = IMAGE_MIME_TYPES[ext]
    if (!mimeType) continue
    const blob = await entry.async('blob')
    const fileName = path.split('/').pop() || `image.${ext}`
    const viewport = inferViewportFromPath(path, fileName)
    const pageName = inferPageName(fileName)
    images.push({
      file: new File([blob], fileName, { type: mimeType, lastModified: Date.now() }),
      pageName,
      viewport,
      sourcePath: path,
      originalName: fileName,
    })
  }

  return images
}

export default function ProjectDashboard({ projects, onProjectSelect, onProjectCreate, onProjectDelete, loading }) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadType, setUploadType] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [zipFile, setZipFile] = useState(null)
  const [imageFiles, setImageFiles] = useState([])
  const [imageAssignments, setImageAssignments] = useState([])
  const [imageUploadStep, setImageUploadStep] = useState(0)
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [hasCustomName, setHasCustomName] = useState(false)
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    name: '',
    clientName: '',
    description: '',
    url: '',
  })

  const revokeImagePreviews = (assignments) => {
    assignments.forEach((assignment) => {
      if (assignment.previewUrl) {
        URL.revokeObjectURL(assignment.previewUrl)
      }
    })
  }

  const addImageAssignments = (files, viewportOverride = null) => {
    const normalized = files
      .map((item) => {
        if (item instanceof File) {
          return {
            file: item,
            pageName: inferPageName(item.name),
            viewport: inferViewport(item.name),
            sourceKey: item.name,
          }
        }
        if (item?.file instanceof File) {
          return {
            file: item.file,
            pageName: item.pageName || inferPageName(item.file.name),
            viewport: item.viewport || inferViewport(item.file.name),
            sourceKey: item.sourcePath || item.file.name,
          }
        }
        return null
      })
      .filter(Boolean)

    const images = normalized.filter(entry => entry.file.type.startsWith('image/'))
    if (images.length === 0) return

    setImageAssignments((prev) => {
      const existing = new Map(prev.map(item => [item.id, item]))
      const next = [...prev]

      images.forEach((entry) => {
        if (entry.file.size > MAX_IMAGE_SIZE_BYTES) {
          return
        }
        const viewport = viewportOverride || entry.viewport
        const id = `${entry.sourceKey}-${entry.file.lastModified}-${viewport}`
        if (existing.has(id)) return
        next.push({
          id,
          file: entry.file,
          pageName: entry.pageName,
          viewport,
          previewUrl: URL.createObjectURL(entry.file),
        })
      })

      setImageFiles(next.map(item => item.file))
      setImageUploadStep(0)
      return next
    })
  }

  const updateImageAssignment = (id, updates) => {
    setImageAssignments((prev) => prev.map((item) => (
      item.id === id ? { ...item, ...updates } : item
    )))
  }

  const imageSummary = useMemo(() => {
    const pages = new Map()
    const duplicateKeys = new Set()
    const usedKeys = new Set()
    const missingNames = []

    imageAssignments.forEach((assignment) => {
      const rawName = assignment.pageName?.trim()
      if (!rawName) {
        missingNames.push(assignment.id)
      }
      const pageName = rawName || 'Untitled Page'
      const slug = slugifyPageName(pageName) || 'page'
      const key = `${slug}-${assignment.viewport}`

      if (usedKeys.has(key)) {
        duplicateKeys.add(key)
      }
      usedKeys.add(key)

      if (!pages.has(slug)) {
        pages.set(slug, { name: pageName, slug, variants: {} })
      }
      pages.get(slug).variants[assignment.viewport] = assignment
    })

    return {
      pages: Array.from(pages.values()),
      duplicateKeys,
      missingNames,
    }
  }, [imageAssignments])

  const imageHasIssues = imageSummary.duplicateKeys.size > 0 || imageSummary.missingNames.length > 0

  const handleDeleteProject = (projectId, e) => {
    if (e) {
      e.stopPropagation()
    }
    if (window.confirm('Delete this project? This cannot be undone.')) {
      onProjectDelete(projectId)
    }
  }

  const getZipDisplayName = (fileName) => {
    if (!fileName) return ''
    return fileName.replace(/\.zip$/i, '')
  }

  const applyZipProjectName = (fileName) => {
    if (hasCustomName) return
    const nextName = getZipDisplayName(fileName)
    if (nextName) {
      setFormData((prev) => ({ ...prev, name: nextName }))
    }
  }

  const applyImageProjectName = (files) => {
    if (hasCustomName) return
    if (!files || files.length === 0) return
    if (formData.name?.trim()) return
    const firstFile = files[0]
    const fileName = firstFile?.name || firstFile?.file?.name || ''
    if (!fileName) return
    const inferred = inferPageName(fileName)
    if (inferred) {
      setFormData((prev) => ({ ...prev, name: inferred }))
    }
  }

  const handleFileSelect = async (e, type, viewportOverride = null) => {
    const files = Array.from(e.target.files || [])
    const firstFile = files[0]

    if (type === 'zip' && isZipFile(firstFile)) {
      try {
        const classification = await classifyZipContents(firstFile)
        if (classification === 'images') {
          const extractedImages = await extractImagesFromZip(firstFile)
          if (extractedImages.length === 0) {
            setUploadError('No images found in that ZIP file.')
            return
          }
          addImageAssignments(extractedImages)
          applyZipProjectName(firstFile.name)
          setUploadType('images')
          setShowUploadModal(true)
        } else {
          revokeImagePreviews(imageAssignments)
          setImageAssignments([])
          setImageFiles([])
          setImageUploadStep(0)
          setZipFile(firstFile)
          setUploadType('zip')
          setShowUploadModal(true)
          applyZipProjectName(firstFile.name)
        }
      } catch (error) {
        setUploadError('Unable to read that ZIP file.')
      }
    } else if (type === 'images') {
      addImageAssignments(files, viewportOverride)
      applyImageProjectName(files)
      setUploadType('images')
      setShowUploadModal(true)
    }
    if (e.target) {
      e.target.value = ''
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)

    // Check for ZIP
    const zipFile = files.find(isZipFile)
    if (zipFile) {
      try {
        const classification = await classifyZipContents(zipFile)
        if (classification === 'images') {
          const extractedImages = await extractImagesFromZip(zipFile)
          if (extractedImages.length === 0) {
            setUploadError('No images found in that ZIP file.')
            return
          }
          addImageAssignments(extractedImages)
          applyZipProjectName(zipFile.name)
          setUploadType('images')
          setShowUploadModal(true)
        } else {
          revokeImagePreviews(imageAssignments)
          setImageAssignments([])
          setImageFiles([])
          setImageUploadStep(0)
          setZipFile(zipFile)
          setUploadType('zip')
          setShowUploadModal(true)
          applyZipProjectName(zipFile.name)
        }
      } catch (error) {
        setUploadError('Unable to read that ZIP file.')
      }
      return
    }

    // Check for images
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length > 0) {
      addImageAssignments(images)
      applyImageProjectName(images)
      setUploadType('images')
      setShowUploadModal(true)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleCreateProject = async () => {
    if (uploadType === 'images' && imageUploadStep === 0) {
      if (imageAssignments.length === 0) {
        setUploadError('Add at least one image to continue.')
        return
      }
      if (imageHasIssues) {
        setUploadError('Resolve page name or viewport conflicts before continuing.')
        return
      }
      setUploadError(null)
      setImageUploadStep(1)
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadProgress(uploadType === 'images' ? 'Processing images...' : 'Extracting files...')

    try {
      if (uploadType === 'zip' && zipFile) {
        const result = await api.uploadProject(zipFile, {
          name: formData.name || 'Untitled Project',
          clientName: formData.clientName,
          description: formData.description,
        }, (progress) => {
          if (progress < 10) {
            setUploadProgress('Extracting files...')
          } else if (progress < 90) {
            setUploadProgress(`Uploading files... ${progress}%`)
          } else {
            setUploadProgress('Finalising project...')
          }
        })
        onProjectCreate(result.project)
        setShowUploadModal(false)
        resetForm()
      } else if (uploadType === 'images' && imageAssignments.length > 0) {
        setUploadProgress('Optimising images...')
        const preparedAssignments = []
        for (const assignment of imageAssignments) {
          const compressed = await compressImageFile(assignment.file, MAX_IMAGE_SIZE_BYTES)
          preparedAssignments.push({
            ...assignment,
            file: compressed,
          })
        }

        const oversized = preparedAssignments.filter((assignment) => assignment.file.size > MAX_IMAGE_SIZE_BYTES)
        if (oversized.length > 0) {
          const names = oversized.map((assignment) => assignment.file.name).join(', ')
          setUploadError(`Some images exceed ${MAX_IMAGE_SIZE_MB}MB after optimisation: ${names}`)
          setUploading(false)
          setUploadProgress('')
          return
        }

        setUploadProgress('Uploading images...')
        const result = await api.uploadImages(preparedAssignments, {
          name: formData.name || 'Untitled Project',
          clientName: formData.clientName,
          description: formData.description,
        })
        onProjectCreate(result.project)
        setShowUploadModal(false)
        resetForm()
      } else if (uploadType === 'url') {
        if (!formData.url) {
          setUploadError('Enter a valid website URL.')
          setUploading(false)
          setUploadProgress('')
          return
        }
        setUploadProgress('Fetching website...')
        const result = await api.uploadUrl(formData.url, {
          name: formData.name || 'Untitled Project',
          clientName: formData.clientName,
          description: formData.description,
        })
        onProjectCreate(result.project)
        setShowUploadModal(false)
        resetForm()
      }
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const resetForm = () => {
    setFormData({ name: '', clientName: '', description: '', url: '' })
    setZipFile(null)
    setImageFiles([])
    revokeImagePreviews(imageAssignments)
    setImageAssignments([])
    setImageUploadStep(0)
    setUploadType(null)
    setHasCustomName(false)
  }

  const copyShareUrl = async (projectId, e) => {
    e?.stopPropagation()
    const shareUrl = api.getShareUrl(projectId)
    await navigator.clipboard.writeText(shareUrl)
    setCopiedId(projectId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const filteredProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40">
        <div className="mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <img
                src="/annotate-by-opace-small.png"
                alt="Annotate by Opace logo"
                className="w-10 h-10 rounded-xl object-contain"
              />
              <div>
                <h1 className="text-xl font-semibold text-neutral-800">Annotate by Opace</h1>
                <p className="text-xs text-neutral-500">The Visual Feedback &amp; Website Critique Tool</p>
              </div>
            </a>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-neutral-100 border-0 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-500 w-64
                           placeholder-neutral-400"
                />
              </div>
              <button className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Project
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Zone */}
        <div
          className={`mb-10 p-10 border-2 border-dashed rounded-2xl text-center
                     transition-all duration-300 cursor-pointer group
                     ${dragOver
                       ? 'border-primary-500 bg-primary-50 scale-[1.01]'
                       : 'border-neutral-300 bg-white hover:border-primary-400 hover:bg-neutral-50'
                     }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
                         transition-all duration-300
                         ${dragOver ? 'bg-primary-100' : 'bg-neutral-100 group-hover:bg-primary-100'}`}>
            <Upload className={`w-8 h-8 transition-colors duration-300
                              ${dragOver ? 'text-primary-600' : 'text-neutral-400 group-hover:text-primary-600'}`} />
          </div>
          <h3 className="text-lg font-semibold text-neutral-800 mb-2">
            Drop your files here
          </h3>
          <p className="text-neutral-500 mb-4">
            Drag & drop a ZIP file or images, or click to browse
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-neutral-400">
            <span className="flex items-center gap-1"><FolderArchive className="w-3.5 h-3.5" /> ZIP</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Images</span>
            <span>•</span>
            <span className="flex items-center gap-1"><FileCode className="w-3.5 h-3.5" /> HTML</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,image/*"
            multiple
            onChange={(e) => handleFileSelect(e, e.target.files[0]?.name.endsWith('.zip') ? 'zip' : 'images')}
            className="hidden"
          />
        </div>

        {/* Upload Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <button
            onClick={() => { setUploadType('zip'); fileInputRef.current?.click() }}
            className="card p-5 text-left hover:border-primary-300 group transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3
                          group-hover:bg-purple-200 transition-colors">
              <FolderArchive className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-medium text-neutral-800 mb-1">ZIP Archive</h3>
            <p className="text-sm text-neutral-500">HTML, CSS, JS & assets</p>
          </button>

          <button
            onClick={() => { setUploadType('images'); setShowUploadModal(true) }}
            className="card p-5 text-left hover:border-primary-300 group transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center mb-3
                          group-hover:bg-pink-200 transition-colors">
              <Image className="w-5 h-5 text-pink-600" />
            </div>
            <h3 className="font-medium text-neutral-800 mb-1">Image Mockups</h3>
            <p className="text-sm text-neutral-500">JPG, PNG, WebP, SVG</p>
          </button>

          <button
            onClick={() => { setUploadType('url'); setShowUploadModal(true) }}
            className="card p-5 text-left hover:border-primary-300 group transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center mb-3
                          group-hover:bg-teal-200 transition-colors">
              <Globe className="w-5 h-5 text-teal-600" />
            </div>
            <h3 className="font-medium text-neutral-800 mb-1">Live Website</h3>
            <p className="text-sm text-neutral-500">Enter any URL</p>
          </button>
        </div>

        {/* Projects Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-800">Your Projects</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-neutral-200' : 'hover:bg-neutral-100'}`}
            >
              <Grid3X3 className="w-4 h-4 text-neutral-600" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-neutral-200' : 'hover:bg-neutral-100'}`}
            >
              <List className="w-4 h-4 text-neutral-600" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-neutral-500">Loading projects...</p>
            </div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-neutral-100 flex items-center justify-center">
              <FolderArchive className="w-10 h-10 text-neutral-300" />
            </div>
            <h3 className="text-lg font-medium text-neutral-700 mb-2">
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="text-neutral-500 mb-6">
              {searchQuery ? 'Try a different search term' : 'Upload your first design mockup to get started'}
            </p>
            {!searchQuery && (
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
                Upload Files
              </button>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'
            : 'space-y-3'
          }>
            {filteredProjects.map(project => (
              <div
                key={project.id}
                onClick={() => onProjectSelect(project)}
                className={`card overflow-hidden cursor-pointer group animate-fade-in
                          ${viewMode === 'list' ? 'flex items-center p-4 gap-4' : ''}`}
              >
                {/* Thumbnail */}
                <div className={`bg-gradient-to-br from-neutral-100 to-neutral-200
                              flex items-center justify-center
                              ${viewMode === 'grid' ? 'aspect-[4/3]' : 'w-16 h-16 rounded-lg flex-shrink-0'}`}>
                  <FileCode className={`text-neutral-400 ${viewMode === 'grid' ? 'w-12 h-12' : 'w-6 h-6'}`} />
                </div>

                <div className={viewMode === 'grid' ? 'p-4' : 'flex-1 min-w-0'}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-medium text-neutral-800 truncate">{project.name}</h3>
                  </div>

                  {project.clientName && (
                    <p className="text-sm text-neutral-500 flex items-center gap-1 mb-2">
                      <Users className="w-3 h-3" /> {project.clientName}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(project.lastModified || project.createdAt)}
                    </span>
                    <span>{project.pageCount || project.pages?.length || 0} pages</span>
                  </div>
                </div>

                {viewMode === 'list' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => copyShareUrl(project.id, e)}
                      className="py-2 px-3 bg-neutral-100 text-neutral-700 text-sm rounded-lg
                               hover:bg-neutral-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {copiedId === project.id ? (
                        <><Check className="w-3.5 h-3.5 text-green-600" /> Copied</>
                      ) : (
                        <><Link className="w-3.5 h-3.5" /> Share</>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onProjectSelect(project)
                      }}
                      className="py-2 px-3 bg-primary-600 text-white text-sm rounded-lg
                               hover:bg-primary-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" /> Open
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="py-2 px-3 bg-red-50 text-red-700 text-sm rounded-lg
                               hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}

                {/* Actions overlay for grid */}
                {viewMode === 'grid' && (
                  <div className="px-4 pb-4 pt-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => copyShareUrl(project.id, e)}
                      className="flex-1 py-2 bg-neutral-100 text-neutral-700 text-sm rounded-lg
                               hover:bg-neutral-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {copiedId === project.id ? (
                        <><Check className="w-3.5 h-3.5 text-green-600" /> Copied</>
                      ) : (
                        <><Link className="w-3.5 h-3.5" /> Share</>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onProjectSelect(project)
                      }}
                      className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg
                                     hover:bg-primary-700 transition-colors flex items-center justify-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Open
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="flex-1 py-2 bg-red-50 text-red-700 text-sm rounded-lg
                               hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {/* Modern Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-neutral-800">
                {uploadType === 'url' ? 'Add Website URL' :
                 uploadType === 'images' ? 'Upload Images' : 'Create Project'}
              </h2>
              <button
                onClick={() => { setShowUploadModal(false); resetForm(); setUploadError(null) }}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {uploadError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-3 h-3" />
                  </div>
                  {uploadError}
                </div>
              )}

              {uploadProgress && (
                <div className="bg-primary-50 border border-primary-200 text-primary-700 px-4 py-3 rounded-xl text-sm flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin"></div>
                  {uploadProgress}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setHasCustomName(true)
                    setFormData({ ...formData, name: e.target.value })
                  }}
                  className="input-field"
                  placeholder="e.g. Homepage Redesign v2"
                  disabled={uploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Client</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="input-field"
                  placeholder="e.g. Acme Corporation"
                  disabled={uploading}
                />
              </div>

              {uploadType === 'images' && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-4">
                  <div className="space-y-2 text-xs text-neutral-600">
                    <p className="font-semibold text-neutral-700 uppercase tracking-wide">How image mockups work</p>
                    <p>Upload each page as an image. Add desktop versions first, then optional tablet/mobile mockups.</p>
                    <p>Use clear filenames like <span className="font-medium text-neutral-700">homepage-desktop.png</span> so we can auto-match viewports.</p>
                    <p>Tip: You can also drop a ZIP of images and we will unpack it for you.</p>
                    <p>Images over {MAX_IMAGE_SIZE_MB}MB will be lightly compressed before upload.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => document.getElementById('image-upload-desktop')?.click()}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm text-neutral-700 hover:border-primary-300 transition-colors"
                    >
                      <span>Desktop mockups</span>
                      <span className="text-xs text-neutral-400">Add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('image-upload-tablet')?.click()}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm text-neutral-700 hover:border-primary-300 transition-colors"
                    >
                      <span>Tablet mockups</span>
                      <span className="text-xs text-neutral-400">Add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('image-upload-mobile')?.click()}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm text-neutral-700 hover:border-primary-300 transition-colors"
                    >
                      <span>Mobile mockups</span>
                      <span className="text-xs text-neutral-400">Add</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => document.getElementById('image-upload-mixed')?.click()}
                    className="w-full px-3 py-2 rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
                  >
                    Upload a mixed batch (we'll try to detect device from filenames)
                  </button>

                  <input
                    id="image-upload-desktop"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'images', 'desktop')}
                    className="hidden"
                  />
                  <input
                    id="image-upload-tablet"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'images', 'tablet')}
                    className="hidden"
                  />
                  <input
                    id="image-upload-mobile"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'images', 'mobile')}
                    className="hidden"
                  />
                  <input
                    id="image-upload-mixed"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'images')}
                    className="hidden"
                  />
                </div>
              )}

              {uploadType === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Website URL</label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="input-field"
                    placeholder="https://example.com"
                    disabled={uploading}
                  />
                </div>
              )}

              {uploadType === 'images' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    <span>Step {imageUploadStep + 1} of 2</span>
                    <span>{imageAssignments.length} image{imageAssignments.length > 1 ? 's' : ''}</span>
                  </div>

                  {imageAssignments.length === 0 ? (
                    <div className="bg-white border border-neutral-200 rounded-lg p-3 text-sm text-neutral-500">
                      Add at least one mockup image to continue.
                    </div>
                  ) : (
                    <>
                      {imageSummary.missingNames.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs">
                          Add a page name for every image before continuing.
                        </div>
                      )}

                      {imageSummary.duplicateKeys.size > 0 && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                          Each page can only have one image per viewport. Resolve duplicates to continue.
                        </div>
                      )}

                      {imageUploadStep === 0 ? (
                        <div className="space-y-3">
                          <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-xs text-neutral-500">
                            Match each mockup to a page and viewport. Tip: use filenames like
                            <span className="font-medium text-neutral-700"> homepage-desktop.png</span>.
                          </div>
                          <div className="space-y-3 max-h-64 overflow-auto pr-1">
                            {imageAssignments.map((assignment) => (
                              <div key={assignment.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-neutral-200">
                                <img
                                  src={assignment.previewUrl}
                                  alt={assignment.file.name}
                                  className="w-12 h-12 rounded-md object-cover border border-neutral-200"
                                />
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={assignment.pageName}
                                    onChange={(e) => updateImageAssignment(assignment.id, { pageName: e.target.value })}
                                    className="input-field text-sm"
                                    placeholder="Page name"
                                    disabled={uploading}
                                  />
                                  <select
                                    value={assignment.viewport}
                                    onChange={(e) => updateImageAssignment(assignment.id, { viewport: e.target.value })}
                                    className="input-field text-sm"
                                    disabled={uploading}
                                  >
                                    {IMAGE_VIEWPORTS.map((viewportOption) => (
                                      <option key={viewportOption.key} value={viewportOption.key}>
                                        {viewportOption.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {assignment.file.size > MAX_IMAGE_SIZE_BYTES && (
                                  <span className="text-xs text-amber-600">
                                    Will compress
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {imageSummary.pages.map((page) => (
                            <div key={page.slug} className="bg-white rounded-lg p-3 border border-neutral-200">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-neutral-800">{page.name}</p>
                                <span className="text-xs text-neutral-400">{Object.keys(page.variants).length} viewports</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {IMAGE_VIEWPORTS.map((viewportOption) => {
                                  const exists = Boolean(page.variants[viewportOption.key])
                                  return (
                                    <span
                                      key={viewportOption.key}
                                      className={`px-2 py-1 rounded-full text-xs ${
                                        exists
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-neutral-100 text-neutral-400'
                                      }`}
                                    >
                                      {viewportOption.label}
                                    </span>
                                  )
                                })}
                              </div>
                              {IMAGE_VIEWPORTS.filter((viewportOption) => !page.variants[viewportOption.key]).length > 0 && (
                                <p className="text-xs text-neutral-500 mt-2">
                                  Missing viewports will fall back to the closest available size.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* File Preview */}
              {uploadType !== 'images' && (zipFile || imageFiles.length > 0) && (
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Files to upload</p>
                  {zipFile && (
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-neutral-200">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <FolderArchive className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate">{zipFile.name}</p>
                        <p className="text-xs text-neutral-500">{(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex gap-3 shrink-0">
              {uploadType === 'images' && imageUploadStep === 1 && (
                <button
                  onClick={() => setImageUploadStep(0)}
                  className="btn-secondary flex-1"
                  disabled={uploading}
                >
                  Back
                </button>
              )}
              <button
                onClick={() => { setShowUploadModal(false); resetForm(); setUploadError(null) }}
                className="btn-secondary flex-1"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={
                  uploading ||
                  !formData.name ||
                  (uploadType === 'url' && !formData.url) ||
                  (uploadType === 'zip' && !zipFile) ||
                  (uploadType === 'images' && (imageAssignments.length === 0 || imageHasIssues))
                }
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    {uploadType === 'images' && imageUploadStep === 0 ? 'Next' : 'Create Project'}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </div>
  )
}
