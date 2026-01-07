import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, MessageSquare, Monitor, Tablet, Smartphone, Download, Save, Copy, Check, Link } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '2.7.0'

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
  const [showAllComments, setShowAllComments] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [drawEnd, setDrawEnd] = useState(null)
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const [iframeHeight, setIframeHeight] = useState('100vh')

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

  // Mouse handlers for both point click and rectangle drag
  const handleOverlayMouseDown = (e) => {
    if (!commentMode) return
    e.preventDefault()

    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setDrawStart({ x, y })
    setDrawEnd({ x, y })
    setIsDrawing(true)
  }

  const handleOverlayMouseMove = (e) => {
    if (!isDrawing || !commentMode) return

    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setDrawEnd({ x, y })
  }

  const handleOverlayMouseUp = (e) => {
    if (!isDrawing || !commentMode) return

    const rect = overlayRef.current.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top

    setIsDrawing(false)

    // Calculate if this was a click (small movement) or a drag (rectangle)
    const dx = Math.abs(endX - drawStart.x)
    const dy = Math.abs(endY - drawStart.y)
    const isRectangle = dx > 10 || dy > 10  // Threshold for rectangle vs point

    if (isRectangle) {
      // Rectangle annotation
      const x = Math.min(drawStart.x, endX)
      const y = Math.min(drawStart.y, endY)
      const width = Math.abs(endX - drawStart.x)
      const height = Math.abs(endY - drawStart.y)

      setTempPinPosition({ x, y, width, height, isRectangle: true })
    } else {
      // Point annotation
      setTempPinPosition({ x: drawStart.x, y: drawStart.y })
    }

    setShowCommentInput(true)
    setCommentText('')
    setCommentMode(false)
    setDrawStart(null)
    setDrawEnd(null)
  }

  // Handle mouse leaving the overlay during drag
  const handleOverlayMouseLeave = () => {
    if (isDrawing) {
      setIsDrawing(false)
      setDrawStart(null)
      setDrawEnd(null)
    }
  }

  // Get the current drawing rectangle for preview
  const getDrawingRect = () => {
    if (!isDrawing || !drawStart || !drawEnd) return null

    const x = Math.min(drawStart.x, drawEnd.x)
    const y = Math.min(drawStart.y, drawEnd.y)
    const width = Math.abs(drawEnd.x - drawStart.x)
    const height = Math.abs(drawEnd.y - drawStart.y)

    return { x, y, width, height }
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
      width: tempPinPosition.width || null,
      height: tempPinPosition.height || null,
      isRectangle: tempPinPosition.isRectangle || false,
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

  // Get all comments across all pages with page info
  const getAllComments = () => {
    const allComments = []
    for (const [pageKey, pageComments] of Object.entries(comments)) {
      const pageName = pageKey.split('/').pop()
      pageComments.forEach((comment, index) => {
        allComments.push({
          ...comment,
          pageKey,
          pageName,
          pageIndex: index + 1
        })
      })
    }
    return allComments
  }

  const getTotalCommentCount = () => {
    return Object.values(comments).flat().length
  }

  const generatePDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - (margin * 2)

    // Title page
    pdf.setFontSize(24)
    pdf.setFont(undefined, 'bold')
    pdf.text(project.name, margin, 40)

    pdf.setFontSize(14)
    pdf.setFont(undefined, 'normal')
    pdf.text(`Client: ${project.clientName || 'N/A'}`, margin, 55)

    pdf.setFontSize(12)
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, margin, 68)

    const totalComments = Object.values(comments).flat().length
    pdf.text(`Total Comments: ${totalComments}`, margin, 81)

    // Add a separator line
    pdf.setDrawColor(200)
    pdf.line(margin, 90, pageWidth - margin, 90)

    let yPosition = 105
    let pageIndex = 0

    for (const [pagePath, pageComments] of Object.entries(comments)) {
      if (pageComments.length === 0) continue

      // Check if we need a new page
      if (yPosition > 250) {
        pdf.addPage()
        yPosition = 25
      }

      const pageName = pagePath.split('/').pop()

      // Page header
      pdf.setFontSize(14)
      pdf.setFont(undefined, 'bold')
      pdf.setTextColor(60, 60, 60)
      pdf.text(`Page: ${pageName}`, margin, yPosition)
      pdf.setTextColor(0)
      yPosition += 12

      for (let i = 0; i < pageComments.length; i++) {
        const comment = pageComments[i]

        // Check if we need a new page before each comment
        if (yPosition > 260) {
          pdf.addPage()
          yPosition = 25
        }

        // Comment number with background
        pdf.setFillColor(59, 130, 246) // Blue
        pdf.circle(margin + 4, yPosition - 2, 4, 'F')
        pdf.setFontSize(9)
        pdf.setTextColor(255, 255, 255)
        pdf.text(`${i + 1}`, margin + 2.5, yPosition)
        pdf.setTextColor(0)

        // Comment text
        pdf.setFontSize(11)
        pdf.setFont(undefined, 'normal')
        const lines = pdf.splitTextToSize(comment.text, contentWidth - 15)
        pdf.text(lines, margin + 12, yPosition)

        // Calculate height used by text (approx 5mm per line)
        const textHeight = lines.length * 5
        yPosition += textHeight + 3

        // Meta information
        pdf.setFontSize(8)
        pdf.setTextColor(120, 120, 120)
        let metaText = `Viewport: ${comment.viewport} | Position: (${Math.round(comment.x)}, ${Math.round(comment.y)})`
        if (comment.width && comment.height) {
          metaText += ` | Area: ${Math.round(comment.width)}x${Math.round(comment.height)}`
        }
        pdf.text(metaText, margin + 12, yPosition)
        pdf.setTextColor(0)

        yPosition += 10
      }

      yPosition += 8 // Extra spacing between pages
      pageIndex++
    }

    // If no comments at all, add a message
    if (totalComments === 0) {
      pdf.setFontSize(12)
      pdf.setTextColor(100)
      pdf.text('No comments have been added to this project yet.', margin, yPosition)
      pdf.setTextColor(0)
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
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Main App Header - same as Dashboard */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-3">
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
              <input
                type="text"
                placeholder="Search projects..."
                className="pl-10 pr-4 py-2 bg-neutral-100 border border-neutral-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={onBack}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                + New Project
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Action Bar - Back, Share, Add Comments, Export PDF */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-full mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>

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
                    : 'bg-yellow-500 text-white hover:bg-yellow-600'
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
        </div>
      </div>

      {/* Comment mode hint bar */}
      {commentMode && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2">
          <p className="text-sm text-yellow-800 text-center">
            <strong>Comment Mode Active:</strong> Click to add a point marker, or click and drag to highlight an area
          </p>
        </div>
      )}

      {/* Viewport and Page Tabs Bar */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-full mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {availableViewports.map((key) => {
                const { label, icon: Icon } = VIEWPORTS[key]
                return (
                  <button
                    key={key}
                    onClick={() => setViewport(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
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
                  className={`px-3 py-2 rounded-lg whitespace-nowrap transition-colors text-sm ${
                    currentPage === index
                      ? 'bg-neutral-800 text-white'
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

      {/* Main Content Area - Preview + Comments Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 bg-neutral-100 overflow-auto ${viewportWidth !== '100%' ? 'flex justify-center' : ''}`}>
          <div
            className="bg-white relative flex-shrink-0"
            style={{
              width: viewportWidth === '100%' ? '100%' : `${viewportWidth}px`,
              maxWidth: isImageProject ? 'calc(100vw - 320px)' : undefined,
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
                      style={{ maxWidth: '100%' }}
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
                        className="w-full border-0"
                        style={{ minHeight: '100vh', display: 'block' }}
                        title={currentPageData.name}
                        sandbox="allow-same-origin allow-scripts"
                      />
                    )
                  } else {
                    return (
                      <iframe
                        ref={iframeRef}
                        srcDoc={iframeData.content}
                        className="w-full border-0"
                        style={{ minHeight: '100vh', display: 'block' }}
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
                onMouseDown={handleOverlayMouseDown}
                onMouseMove={handleOverlayMouseMove}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseLeave}
              >
                {/* Render existing comments - both pins and rectangles */}
                {getPageComments().map((comment, index) => (
                  comment.isRectangle ? (
                    // Rectangle annotation
                    <div
                      key={comment.id}
                      className={`comment-rect ${activeComment === comment.id ? 'active' : ''}`}
                      style={{
                        left: `${comment.x}px`,
                        top: `${comment.y}px`,
                        width: `${comment.width}px`,
                        height: `${comment.height}px`
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveComment(activeComment === comment.id ? null : comment.id)
                      }}
                    >
                      <span className="comment-rect-number">{index + 1}</span>
                    </div>
                  ) : (
                    // Point pin annotation
                    <div
                      key={comment.id}
                      className={`comment-pin ${activeComment === comment.id ? 'active' : ''}`}
                      style={{ left: `${comment.x}px`, top: `${comment.y}px` }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveComment(activeComment === comment.id ? null : comment.id)
                      }}
                    >
                      {index + 1}
                    </div>
                  )
                ))}

                {/* Drawing preview rectangle */}
                {isDrawing && getDrawingRect() && (
                  <div
                    className="comment-rect-preview"
                    style={{
                      left: `${getDrawingRect().x}px`,
                      top: `${getDrawingRect().y}px`,
                      width: `${getDrawingRect().width}px`,
                      height: `${getDrawingRect().height}px`
                    }}
                  />
                )}

                {/* Temporary position indicator */}
                {tempPinPosition && !showCommentInput && (
                  tempPinPosition.isRectangle ? (
                    <div
                      className="comment-rect"
                      style={{
                        left: `${tempPinPosition.x}px`,
                        top: `${tempPinPosition.y}px`,
                        width: `${tempPinPosition.width}px`,
                        height: `${tempPinPosition.height}px`
                      }}
                    >
                      <span className="comment-rect-number">?</span>
                    </div>
                  ) : (
                    <div
                      className="comment-pin"
                      style={{ left: `${tempPinPosition.x}px`, top: `${tempPinPosition.y}px` }}
                    >
                      ?
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-80 min-w-[280px] flex-shrink-0 bg-white border-l overflow-y-auto">
          <div className="p-4">
            {/* Toggle between page comments and all comments */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setShowAllComments(false)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  !showAllComments
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                This Page ({getPageComments().length})
              </button>
              <button
                onClick={() => setShowAllComments(true)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  showAllComments
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                All Pages ({getTotalCommentCount()})
              </button>
            </div>

            <h2 className="text-lg font-bold mb-4">
              {showAllComments ? `All Comments (${getTotalCommentCount()})` : `Comments (${getPageComments().length})`}
            </h2>

            {showAllComments ? (
              // All comments view
              getAllComments().length === 0 ? (
                <p className="text-gray-500 text-sm">No comments yet across any pages.</p>
              ) : (
                <div className="space-y-3">
                  {getAllComments().map((comment) => (
                    <div
                      key={`${comment.pageKey}-${comment.id}`}
                      className={`border rounded p-3 cursor-pointer transition-colors ${
                        activeComment === comment.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        // Navigate to the page containing this comment
                        const pageIdx = project.pages.findIndex(p =>
                          (p.relativePath || p.path) === comment.pageKey
                        )
                        if (pageIdx !== -1 && pageIdx !== currentPage) {
                          setCurrentPage(pageIdx)
                        }
                        setActiveComment(activeComment === comment.id ? null : comment.id)
                      }}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {comment.pageName}
                        </span>
                        <span className="font-bold text-blue-600">#{comment.pageIndex}</span>
                      </div>
                      <p className="text-sm mb-2">{comment.text}</p>
                      <div className="text-xs text-gray-500">
                        <div>Viewport: {comment.viewport}</div>
                        <div>Position: ({Math.round(comment.x)}, {Math.round(comment.y)}){comment.width ? ` - Size: ${Math.round(comment.width)}x${Math.round(comment.height)}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Current page comments view
              getPageComments().length === 0 ? (
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
                        <div>Position: ({Math.round(comment.x)}, {Math.round(comment.y)}){comment.width ? ` - Size: ${Math.round(comment.width)}x${Math.round(comment.height)}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {showCommentInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-bold">Add Comment</h3>
              {tempPinPosition?.isRectangle && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                  Area Selection
                </span>
              )}
            </div>
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
