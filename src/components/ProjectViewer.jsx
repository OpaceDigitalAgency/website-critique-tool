import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, MessageSquare, Monitor, Tablet, Smartphone, Download, Save, Copy, Check, Link } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '2.2.0'

const VIEWPORTS = {
  mobile: { width: 375, label: 'Mobile', icon: Smartphone },
  tablet: { width: 768, label: 'Tablet', icon: Tablet },
  desktop: { width: 1440, label: 'Desktop', icon: Monitor },
  full: { width: '100%', label: 'Full Width', icon: Monitor }
}

export default function ProjectViewer({ project, onBack }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [viewport, setViewport] = useState('full')
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
    if (!project?.id) return

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
  }, [project?.id])

  // Auto-save comments to cloud with debounce
  const saveCommentsToCloud = useCallback(async (commentsToSave) => {
    if (!project?.id) return

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
  }, [project?.id])

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
  const isImageProject = project.type === 'images' || Boolean(currentPageData?.variants)

  // Auto-resize iframe to fit content
  useEffect(() => {
    if (isImageProject) return

    const handleMessage = (event) => {
      if (event.data && event.data.type === 'resize' && event.data.height) {
        if (iframeRef.current) {
          iframeRef.current.style.height = event.data.height + 'px'
        }
      }
    }

    const resizeIframe = () => {
      try {
        const iframe = iframeRef.current
        if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
          const body = iframe.contentWindow.document.body
          const html = iframe.contentWindow.document.documentElement
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          )
          iframe.style.height = height + 'px'
        }
      } catch (e) {
        // Cross-origin or other error - ignore
      }
    }

    window.addEventListener('message', handleMessage)

    const iframe = iframeRef.current
    if (iframe) {
      iframe.addEventListener('load', resizeIframe)
      // Also try to resize after a short delay
      setTimeout(resizeIframe, 100)
      setTimeout(resizeIframe, 500)
      setTimeout(resizeIframe, 1000)
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      if (iframe) {
        iframe.removeEventListener('load', resizeIframe)
      }
    }
  }, [currentPage, isImageProject])

  useEffect(() => {
    if (!isImageProject || !currentPageData?.variants) return
    const available = ['desktop', 'tablet', 'mobile'].filter(
      (key) => currentPageData.variants[key]
    )
    if (available.length === 0) return
    if (!available.includes(viewport)) {
      setViewport(available[0])
    }
  }, [currentPageData, isImageProject, viewport])

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

  // Returns { type: 'url' | 'srcdoc', content: string }
  const getIframeContent = () => {
    const resizeScript = `
      <script>
        (function() {
          function notifyResize() {
            try {
              const height = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
              );
              window.parent.postMessage({ type: 'resize', height: height }, '*');
            } catch(e) {}
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', notifyResize);
          } else {
            notifyResize();
          }

          window.addEventListener('load', notifyResize);
          setTimeout(notifyResize, 100);
          setTimeout(notifyResize, 500);
          setTimeout(notifyResize, 1000);

          // Watch for dynamic content changes
          if (window.ResizeObserver) {
            const observer = new ResizeObserver(notifyResize);
            observer.observe(document.body);
          }
        })();
      </script>
    `;

    if (project.type === 'url') {
      return { type: 'url', content: currentPageData.path }
    } else if (project.assetKeys && project.assetKeys.length > 0) {
      // Cloud-based project - use the page URL endpoint for proper navigation
      const pagePath = currentPageData.relativePath || currentPageData.path || ''
      return { type: 'url', content: api.getPageUrl(project.id, pagePath) }
    } else if (project.assets) {
      // Legacy local assets (base64 encoded) - use srcDoc
      let htmlContent = currentPageData.content || ''
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

      // Inject resize script before closing body tag
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', resizeScript + '</body>');
      } else {
        htmlContent += resizeScript;
      }

      return { type: 'srcdoc', content: htmlContent }
    } else {
      // Fallback - use content as-is
      let htmlContent = currentPageData.content || '';

      // Inject resize script
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', resizeScript + '</body>');
      } else {
        htmlContent += resizeScript;
      }

      return { type: 'srcdoc', content: htmlContent }
    }
  }

  const getImageVariantForViewport = () => {
    if (!currentPageData?.variants) return null
    const viewportKey = viewport === 'full' ? 'desktop' : viewport
    return (
      currentPageData.variants[viewportKey] ||
      currentPageData.variants.desktop ||
      currentPageData.variants.tablet ||
      currentPageData.variants.mobile ||
      null
    )
  }

  const copyShareUrl = async () => {
    const shareUrl = api.getShareUrl(project.id)
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Safety check - show loading if project is not loaded
  if (!project || !project.pages || project.pages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  const viewportWidth = VIEWPORTS[viewport].width
  const availableViewports = (() => {
    if (!isImageProject) {
      return Object.keys(VIEWPORTS)
    }
    if (!currentPageData?.variants) return ['desktop']
    return ['desktop', 'tablet', 'mobile'].filter((key) => currentPageData.variants[key])
  })()

  return (
    <div className="h-screen flex flex-col bg-neutral-50">
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <img
                src="/annotate-by-opace-small.png"
                alt="Annotate by Opace logo"
                className="w-10 h-10 rounded-xl object-contain"
              />
              <div>
                <h1 className="text-xl font-semibold text-neutral-800">Annotate by Opace</h1>
                <p className="text-xs text-neutral-500">{project.name}{project.clientName ? ` - ${project.clientName}` : ''}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-sm text-neutral-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-neutral-500"></div>
                  Saving...
                </span>
              )}

              <button
                onClick={copyShareUrl}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
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
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  commentMode
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                {commentMode ? 'Exit Comment Mode' : 'Add Comments'}
              </button>

              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {availableViewports.map((key) => {
                const { label, icon: Icon } = VIEWPORTS[key]
                return (
                  <button
                    key={key}
                    onClick={() => setViewport(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      viewport === key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 flex gap-2 overflow-x-auto">
              {project.pages.map((page, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                    currentPage === index
                      ? 'bg-indigo-600 text-white'
                      : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
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
        <div className="flex-1 flex justify-center items-start overflow-auto bg-neutral-100">
          <div
            className="bg-white relative w-full"
            style={{
              maxWidth: viewportWidth === '100%' ? '100%' : `${viewportWidth}px`,
              minHeight: '100%'
            }}
          >
            <div className="relative" style={isImageProject ? {} : { minHeight: '100vh' }}>
              {isImageProject ? (
                (() => {
                  const variant = getImageVariantForViewport()
                  if (!variant) {
                    return (
                      <div className="w-full h-64 flex items-center justify-center text-sm text-gray-500">
                        No image available for this viewport.
                      </div>
                    )
                  }
                  const imageUrl = api.getAssetUrl(project.id, variant.path)
                  return (
                    <img
                      src={imageUrl}
                      alt={currentPageData.name}
                      className="w-full h-auto block"
                    />
                  )
                })()
              ) : (
                (() => {
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
                })()
              )}

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
