import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, MessageSquare, Monitor, Tablet, Smartphone, Download, Save, Copy, Check, Link } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '2.0.4'

const VIEWPORTS = {
  mobile: { width: 375, label: 'Mobile', icon: Smartphone },
  tablet: { width: 768, label: 'Tablet', icon: Tablet },
  desktop: { width: 1440, label: 'Desktop', icon: Monitor },
  full: { width: '100%', label: 'Full Width', icon: Monitor }
}

export default function ProjectViewer({ project, onBack }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [viewport, setViewport] = useState('desktop')
  const [commentMode, setCommentMode] = useState(false)
  const [comments, setComments] = useState({})
  const [activeComment, setActiveComment] = useState(null)
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [tempPinPosition, setTempPinPosition] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)
  const saveTimeoutRef = useRef(null)

  // Load comments from cloud API
  useEffect(() => {
    const loadComments = async () => {
      try {
        const cloudComments = await api.getComments(project.id)
        if (cloudComments && cloudComments.length > 0) {
          // Convert array to object keyed by page
          const commentsObj = {}
          cloudComments.forEach(comment => {
            const pageKey = comment.pageKey || 'default'
            if (!commentsObj[pageKey]) {
              commentsObj[pageKey] = []
            }
            commentsObj[pageKey].push(comment)
          })
          setComments(commentsObj)
        }
      } catch (err) {
        console.error('Failed to load comments:', err)
        // Fall back to localStorage
        const savedComments = localStorage.getItem(`comments-${project.id}`)
        if (savedComments) {
          setComments(JSON.parse(savedComments))
        }
      }
    }
    loadComments()
  }, [project.id])

  // Auto-save comments to cloud with debounce
  const saveCommentsToCloud = useCallback(async (commentsToSave) => {
    setSaving(true)
    try {
      // Flatten comments object to array with pageKey
      const commentsArray = []
      for (const [pageKey, pageComments] of Object.entries(commentsToSave)) {
        pageComments.forEach(comment => {
          commentsArray.push({ ...comment, pageKey })
        })
      }
      await api.saveComments(project.id, commentsArray)
      // Also save to localStorage as backup
      localStorage.setItem(`comments-${project.id}`, JSON.stringify(commentsToSave))
    } catch (err) {
      console.error('Failed to save comments:', err)
    } finally {
      setSaving(false)
    }
  }, [project.id])

  useEffect(() => {
    // Debounce save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (Object.keys(comments).length > 0) {
        saveCommentsToCloud(comments)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [comments, saveCommentsToCloud])

  const currentPageData = project.pages[currentPage]

  const handleOverlayClick = (e) => {
    if (!commentMode) return

    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setTempPinPosition({ x, y })
    setShowCommentInput(true)
    setCommentText('')
    // Temporarily disable comment mode to allow interaction with the dialog
    setCommentMode(false)
  }

  const handleAddComment = () => {
    if (!commentText.trim() || !tempPinPosition) return

    const pageKey = currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    
    const newComment = {
      id: Date.now(),
      text: commentText,
      x: tempPinPosition.x,
      y: tempPinPosition.y,
      viewport: viewport,
      timestamp: new Date().toISOString()
    }

    setComments({
      ...comments,
      [pageKey]: [...pageComments, newComment]
    })

    setShowCommentInput(false)
    setTempPinPosition(null)
    setCommentText('')
  }

  const handleDeleteComment = (commentId) => {
    const pageKey = currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    
    setComments({
      ...comments,
      [pageKey]: pageComments.filter(c => c.id !== commentId)
    })
    setActiveComment(null)
  }

  const getPageComments = () => {
    const pageKey = currentPageData.relativePath || currentPageData.path
    return comments[pageKey] || []
  }

  const generatePDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4')
    let isFirstPage = true

    pdf.setFontSize(20)
    pdf.text(project.name, 20, 20)
    pdf.setFontSize(12)
    pdf.text(`Client: ${project.clientName || 'N/A'}`, 20, 30)
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 40)
    pdf.setFontSize(10)
    pdf.text(`Total Comments: ${Object.values(comments).flat().length}`, 20, 50)

    for (const [pagePath, pageComments] of Object.entries(comments)) {
      if (pageComments.length === 0) continue

      if (!isFirstPage) {
        pdf.addPage()
      } else {
        isFirstPage = false
      }

      const pageName = pagePath.split('/').pop()
      pdf.setFontSize(16)
      pdf.text(`Page: ${pageName}`, 20, isFirstPage ? 70 : 20)

      let yPosition = isFirstPage ? 80 : 30

      for (let i = 0; i < pageComments.length; i++) {
        const comment = pageComments[i]
        
        if (yPosition > 270) {
          pdf.addPage()
          yPosition = 20
        }

        pdf.setFontSize(12)
        pdf.setFont(undefined, 'bold')
        pdf.text(`Comment ${i + 1}:`, 20, yPosition)
        pdf.setFont(undefined, 'normal')
        pdf.setFontSize(10)
        
        const lines = pdf.splitTextToSize(comment.text, 170)
        pdf.text(lines, 20, yPosition + 5)
        
        pdf.setFontSize(8)
        pdf.setTextColor(100)
        pdf.text(`Viewport: ${comment.viewport} | Position: (${Math.round(comment.x)}, ${Math.round(comment.y)})`, 20, yPosition + 5 + (lines.length * 4) + 3)
        pdf.setTextColor(0)

        yPosition += 5 + (lines.length * 4) + 10
      }
    }

    pdf.save(`${project.name}-feedback.pdf`)
  }

  const resolveAssetUrl = (assetMap, baseDir, rawPath) => {
    if (!rawPath) return null
    const [pathOnly, suffix = ''] = rawPath.split(/([?#].*)/)
    const cleanPath = pathOnly.replace(/^\.\//, '').replace(/^\//, '')

    if (baseDir) {
      const withBaseDir = `${baseDir}/${cleanPath}`.replace(/\/+/g, '/')
      if (assetMap.has(withBaseDir)) {
        return `${assetMap.get(withBaseDir)}${suffix}`
      }
    }

    if (assetMap.has(cleanPath)) {
      return `${assetMap.get(cleanPath)}${suffix}`
    }

    const fileName = cleanPath.split('/').pop()
    if (fileName && assetMap.has(fileName)) {
      return `${assetMap.get(fileName)}${suffix}`
    }

    return null
  }

  // Returns { type: 'url' | 'srcdoc', content: string }
  const getIframeContent = () => {
    if (project.type === 'url') {
      return { type: 'url', content: currentPageData.path }
    } else {
      let htmlContent = currentPageData.content || ''

      // Check if we have cloud-stored assets (assetKeys) or local assets
      if (project.assetKeys && project.assetKeys.length > 0) {
        // Cloud-based project - replace asset references with absolute API URLs
        const pagePath = currentPageData.relativePath || currentPageData.path || ''
        const baseDir = pagePath.split('/').slice(0, -1).join('/')

        // Build a map of filenames to asset URLs for easier replacement
        const assetMap = new Map()
        for (const assetKey of project.assetKeys) {
          const assetPath = assetKey.replace(`${project.id}/`, '')
          const fileName = assetPath.split('/').pop()
          // Use absolute URL with full origin
          const assetUrl = `${window.location.origin}${api.getAssetUrl(project.id, assetPath)}`

          // Store multiple path variations for matching
          assetMap.set(assetPath, assetUrl)
          assetMap.set(fileName, assetUrl)
          // Also store with baseDir prefix for relative paths
          if (baseDir) {
            assetMap.set(`${baseDir}/${fileName}`, assetUrl)
          }
        }

        // Replace all src and href attributes with absolute URLs
        htmlContent = htmlContent.replace(
          /(src|href)=["']([^"']+)["']/gi,
          (match, attr, path) => {
            // Skip absolute URLs, data URIs, mailto, tel, and anchors
            if (path.startsWith('http://') || path.startsWith('https://') ||
                path.startsWith('data:') || path.startsWith('//') ||
                path.startsWith('mailto:') || path.startsWith('tel:') ||
                path.startsWith('#')) {
              return match
            }

            const resolved = resolveAssetUrl(assetMap, baseDir, path)
            return resolved ? `${attr}="${resolved}"` : match
          }
        )

        // Also replace url() in inline styles
        htmlContent = htmlContent.replace(
          /url\(["']?([^"')]+)["']?\)/gi,
          (match, path) => {
            if (path.startsWith('http://') || path.startsWith('https://') ||
                path.startsWith('data:') || path.startsWith('//')) {
              return match
            }
            const resolved = resolveAssetUrl(assetMap, baseDir, path)
            return resolved ? `url("${resolved}")` : match
          }
        )
      } else if (project.assets) {
        // Legacy local assets (base64 encoded)
        const pagePath = currentPageData.relativePath || currentPageData.path || ''
        const baseDir = pagePath.split('/').slice(0, -1).join('/')

        for (const [assetPath, assetData] of Object.entries(project.assets)) {
          const fileName = assetPath.split('/').pop()
          const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

          htmlContent = htmlContent.replace(
            new RegExp(`(src|href)=["']([^"']*${escapedFileName})["']`, 'gi'),
            `$1="${assetData}"`
          )
        }
      }

      return { type: 'srcdoc', content: htmlContent }
    }
  }

  const copyShareUrl = async () => {
    const shareUrl = api.getShareUrl(project.id)
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const viewportWidth = VIEWPORTS[viewport].width

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <div>
                <h1 className="text-xl font-bold">{project.name}</h1>
                {project.clientName && (
                  <p className="text-sm text-gray-600">Client: {project.clientName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500"></div>
                  Saving...
                </span>
              )}

              <button
                onClick={copyShareUrl}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                title="Copy share link"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4" />
                    Share
                  </>
                )}
              </button>

              <button
                onClick={() => setCommentMode(!commentMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
                  commentMode
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                {commentMode ? 'Exit Comment Mode' : 'Add Comments'}
              </button>

              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {Object.entries(VIEWPORTS).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  onClick={() => setViewport(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    viewport === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 flex gap-2 overflow-x-auto">
              {project.pages.map((page, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`px-3 py-2 rounded whitespace-nowrap transition-colors ${
                    currentPage === index
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {page.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex justify-center items-start overflow-auto bg-gray-200 p-4">
          <div
            className="bg-white shadow-2xl relative"
            style={{
              width: viewportWidth === '100%' ? '100%' : `${viewportWidth}px`,
              minHeight: '100%'
            }}
          >
            <div className="relative" style={{ height: '800px' }}>
              {(() => {
                const iframeData = getIframeContent()
                if (iframeData.type === 'url') {
                  return (
                    <iframe
                      ref={iframeRef}
                      src={iframeData.content}
                      className="w-full h-full border-0"
                      title={currentPageData.name}
                      sandbox="allow-same-origin allow-scripts"
                    />
                  )
                } else {
                  return (
                    <iframe
                      ref={iframeRef}
                      srcDoc={iframeData.content}
                      className="w-full h-full border-0"
                      title={currentPageData.name}
                      sandbox="allow-same-origin allow-scripts"
                    />
                  )
                }
              })()}

              <div
                ref={overlayRef}
                className={`comment-overlay ${commentMode ? 'active' : ''}`}
                onClick={handleOverlayClick}
              >
                {getPageComments().map((comment) => (
                  <div
                    key={comment.id}
                    className={`comment-pin ${activeComment === comment.id ? 'active' : ''}`}
                    style={{ left: `${comment.x}px`, top: `${comment.y}px` }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveComment(activeComment === comment.id ? null : comment.id)
                    }}
                  >
                    {getPageComments().indexOf(comment) + 1}
                  </div>
                ))}

                {tempPinPosition && (
                  <div
                    className="comment-pin"
                    style={{ left: `${tempPinPosition.x}px`, top: `${tempPinPosition.y}px` }}
                  >
                    ?
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-80 bg-white border-l overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4">Comments ({getPageComments().length})</h2>

            {getPageComments().length === 0 ? (
              <p className="text-gray-500 text-sm">No comments yet. Click "Add Comments" and click on the page to add feedback.</p>
            ) : (
              <div className="space-y-3">
                {getPageComments().map((comment, index) => (
                  <div
                    key={comment.id}
                    className={`border rounded p-3 cursor-pointer transition-colors ${
                      activeComment === comment.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveComment(activeComment === comment.id ? null : comment.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-bold text-blue-600">#{index + 1}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteComment(comment.id)
                        }}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-sm mb-2">{comment.text}</p>
                    <div className="text-xs text-gray-500">
                      <div>Viewport: {comment.viewport}</div>
                      <div>Position: ({Math.round(comment.x)}, {Math.round(comment.y)})</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCommentInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Add Comment</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
              rows="4"
              placeholder="Enter your feedback here..."
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCommentInput(false)
                  setTempPinPosition(null)
                  setCommentText('')
                  // Re-enable comment mode when canceling
                  setCommentMode(true)
                }}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
