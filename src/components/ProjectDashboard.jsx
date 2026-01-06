import { useState, useRef } from 'react'
import {
  Upload, Globe, Plus, Trash2, Eye, Check, Link, Image, FileCode,
  FolderArchive, MoreHorizontal, Clock, Users, Search, Grid3X3, List,
  X, ChevronRight
} from 'lucide-react'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '3.0.1'

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
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    name: '',
    clientName: '',
    description: '',
    url: '',
  })

  const handleFileSelect = (e, type) => {
    const files = Array.from(e.target.files)
    if (type === 'zip' && files[0]?.name.endsWith('.zip')) {
      setZipFile(files[0])
      setUploadType('zip')
      setShowUploadModal(true)
    } else if (type === 'images') {
      setImageFiles(files.filter(f => f.type.startsWith('image/')))
      setUploadType('images')
      setShowUploadModal(true)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)

    // Check for ZIP
    const zipFile = files.find(f => f.name.endsWith('.zip'))
    if (zipFile) {
      setZipFile(zipFile)
      setUploadType('zip')
      setShowUploadModal(true)
      return
    }

    // Check for images
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length > 0) {
      setImageFiles(images)
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
    setUploading(true)
    setUploadError(null)
    setUploadProgress('Extracting files...')

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
      } else if (uploadType === 'images' && imageFiles.length > 0) {
        setUploadProgress('Processing images...')
        const result = await api.uploadImages(imageFiles, {
          name: formData.name || 'Untitled Project',
          clientName: formData.clientName,
          description: formData.description,
        })
        onProjectCreate(result.project)
        setShowUploadModal(false)
        resetForm()
      } else if (uploadType === 'url') {
        setUploadError('URL projects coming soon.')
        setUploading(false)
        return
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
    setUploadType(null)
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
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/annotate-by-opace-small.png"
                alt="Annotate by Opace logo"
                className="w-10 h-10 rounded-xl object-contain"
              />
              <div>
                <h1 className="text-xl font-semibold text-neutral-800">Annotate by Opace</h1>
                <p className="text-xs text-neutral-500">The Visual Feedback &amp; Website Critique Tool</p>
              </div>
            </div>

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
            onClick={() => { setUploadType('images'); document.getElementById('image-upload').click() }}
            className="card p-5 text-left hover:border-primary-300 group transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center mb-3
                          group-hover:bg-pink-200 transition-colors">
              <Image className="w-5 h-5 text-pink-600" />
            </div>
            <h3 className="font-medium text-neutral-800 mb-1">Image Mockups</h3>
            <p className="text-sm text-neutral-500">JPG, PNG, WebP, SVG</p>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFileSelect(e, 'images')}
              className="hidden"
            />
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onProjectDelete(project.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-100 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4 text-neutral-400 hover:text-red-500" />
                    </button>
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
                    <button className="flex-1 py-2 bg-primary-600 text-white text-sm rounded-lg
                                     hover:bg-primary-700 transition-colors flex items-center justify-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Open
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
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 animate-scale-in overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
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
            <div className="px-6 py-5 space-y-5">
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

              {/* File Preview */}
              {(zipFile || imageFiles.length > 0) && (
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
                  {imageFiles.length > 0 && (
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-neutral-200">
                      <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                        <Image className="w-5 h-5 text-pink-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-800">{imageFiles.length} image{imageFiles.length > 1 ? 's' : ''}</p>
                        <p className="text-xs text-neutral-500">Ready to upload</p>
                      </div>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex gap-3">
              <button
                onClick={() => { setShowUploadModal(false); resetForm(); setUploadError(null) }}
                className="btn-secondary flex-1"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={uploading || !formData.name || (uploadType === 'url' && !formData.url) ||
                         (uploadType === 'zip' && !zipFile) || (uploadType === 'images' && imageFiles.length === 0)}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>Create Project <ChevronRight className="w-4 h-4" /></>
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
