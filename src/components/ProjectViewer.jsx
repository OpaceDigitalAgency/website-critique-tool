import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ArrowLeft, MessageSquare, Monitor, Tablet, Smartphone, Download, Check, Link, Undo2, Pencil, Clock, HelpCircle } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import api from '../services/api'

// Component version for cache busting
const COMPONENT_VERSION = '2.9.4'

const VIEWPORTS = {
  mobile: { width: 375, label: 'Mobile', icon: Smartphone },
  tablet: { width: 768, label: 'Tablet', icon: Tablet },
  desktop: { width: 1440, label: 'Desktop', icon: Monitor },
  full: { width: '100%', label: 'Full Width', icon: Monitor }
}

const APPROVAL_VIEWPORTS = ['desktop', 'tablet', 'mobile']
const APPROVAL_LABELS = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile'
}

export default function ProjectViewer({ project, onBack, isClientView = false }) {
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
  const [showGuide, setShowGuide] = useState(false)
  const [showAllComments, setShowAllComments] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [drawEnd, setDrawEnd] = useState(null)
  // Undo history
  const [commentHistory, setCommentHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  // Edit mode
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingText, setEditingText] = useState('')
  // Drag mode
  const [isDragging, setIsDragging] = useState(false)
  const [draggedComment, setDraggedComment] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [approvals, setApprovals] = useState({})
  const [approvalHistory, setApprovalHistory] = useState([])
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [approvalNotice, setApprovalNotice] = useState(null)
  const [approverName, setApproverName] = useState('')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalTarget, setApprovalTarget] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [loadedImageUrl, setLoadedImageUrl] = useState(null)
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const [iframeHeight, setIframeHeight] = useState('100vh')
  // Refs for drag state to avoid stale closures
  const dragStateRef = useRef({ isDragging: false, draggedComment: null, dragOffset: { x: 0, y: 0 }, pointerId: null })
  const commentsRef = useRef(comments)
  const currentPageDataRef = useRef(null)
  const dragTargetRef = useRef(null)
  const approvalsRef = useRef(approvals)
  const approvalNoticeTimeoutRef = useRef(null)

  // Reset page/viewport when switching projects
  useEffect(() => {
    setCurrentPage(0)
    setViewport('desktop')
    setImageLoading(true)
    setLoadedImageUrl(null)
  }, [project?.id])

  // Reset image loading state when viewport or page changes
  useEffect(() => {
    setImageLoading(true)
  }, [viewport, currentPage])

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

  useEffect(() => {
    approvalsRef.current = approvals
  }, [approvals])

  useEffect(() => {
    const storedName = localStorage.getItem('approverName')
    if (storedName) {
      setApproverName(storedName)
    }
  }, [])

  // Load approvals from cloud API
  useEffect(() => {
    if (!project?.id) return

    const loadApprovals = async () => {
      try {
        const data = await api.getApprovals(project.id)
        if (data?.approvals) {
          setApprovals(data.approvals || {})
          setApprovalHistory(data.history || [])
        }
      } catch (err) {
        console.error('Failed to load approvals:', err)
        const savedApprovals = localStorage.getItem(`approvals-${project.id}`)
        const savedHistory = localStorage.getItem(`approval-history-${project.id}`)
        if (savedApprovals) {
          setApprovals(JSON.parse(savedApprovals))
        }
        if (savedHistory) {
          setApprovalHistory(JSON.parse(savedHistory))
        }
      }
    }
    loadApprovals()
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

  useEffect(() => {
    if (!project?.id) return
    localStorage.setItem(`approvals-${project.id}`, JSON.stringify(approvals))
    localStorage.setItem(`approval-history-${project.id}`, JSON.stringify(approvalHistory))
  }, [approvals, approvalHistory, project?.id])

  // Helper to update comments with history tracking
  const updateCommentsWithHistory = useCallback((newComments) => {
    // Add current state to history before making changes
    setCommentHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1)
      // Add current state to history (limit to 50 entries)
      newHistory.push(JSON.parse(JSON.stringify(comments)))
      if (newHistory.length > 50) newHistory.shift()
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
    setComments(newComments)
  }, [comments, historyIndex])

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex < 0 || commentHistory.length === 0) return

    const previousState = commentHistory[historyIndex]
    if (previousState) {
      setComments(previousState)
      setHistoryIndex(prev => prev - 1)
    }
  }, [historyIndex, commentHistory])

  // Check if undo is available
  const canUndo = historyIndex >= 0 && commentHistory.length > 0

  const currentPageData = project.pages[currentPage]
  const isImageProject = project.type === 'images' || Boolean(currentPageData?.variants)
  const currentPageKey = currentPageData?.relativePath || currentPageData?.path || 'default'

  const formatTimestamp = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  const formatViewportList = (viewports = []) => {
    const labels = viewports.map((key) => APPROVAL_LABELS[key] || key)
    if (labels.length === 0) return 'All views'
    if (labels.length === 1) return labels[0]
    if (labels.length === 2) return `${labels[0]} + ${labels[1]}`
    return `${labels.slice(0, -1).join(', ')} + ${labels[labels.length - 1]}`
  }

  const getApprovalViewportsForPage = (page) => {
    if (isImageProject) {
      if (!page?.variants) return ['desktop']
      return APPROVAL_VIEWPORTS.filter((key) => page.variants[key])
    }
    return APPROVAL_VIEWPORTS
  }

  const approvalViewportsForCurrentPage = getApprovalViewportsForPage(currentPageData)
  const getPageApprovalStatus = (page) => {
    const pageKey = page?.relativePath || page?.path || 'default'
    const viewports = getApprovalViewportsForPage(page)
    const approvalsForPage = approvals[pageKey] || {}
    const approvedCount = viewports.filter((key) => approvalsForPage[key]).length
    const approved = viewports.length > 0 && approvedCount === viewports.length
    const latestApproval = viewports
      .map((key) => approvalsForPage[key])
      .filter(Boolean)
      .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt))[0] || null
    return { approved, approvedCount, total: viewports.length, latestApproval, viewports }
  }

  const currentPageApproval = getPageApprovalStatus(currentPageData)

  const approvalProgress = useMemo(() => {
    if (!project?.pages) return { total: 0, approved: 0 }
    const total = project.pages.length
    const approved = project.pages.filter((page) => getPageApprovalStatus(page).approved).length
    return { total, approved }
  }, [approvals, project?.pages, isImageProject])

  const pageApprovalHistory = useMemo(() => {
    if (!approvalHistory.length) return []
    return approvalHistory
      .filter((entry) => entry.pageKey === currentPageKey)
      .slice(-5)
      .reverse()
  }, [approvalHistory, currentPageKey])

  useEffect(() => {
    return () => {
      if (approvalNoticeTimeoutRef.current) {
        clearTimeout(approvalNoticeTimeoutRef.current)
      }
    }
  }, [])

  const getPageCommentCount = useCallback((pageKey) => {
    return (comments[pageKey] || []).length
  }, [comments])

  const requestApproval = (pageKey, viewports) => {
    setApprovalTarget({
      pageKey,
      viewports,
      pageName: currentPageData?.name || 'Page'
    })
    setShowApprovalModal(true)
  }

  const clearApprovalsForPage = useCallback(async (pageKey, viewports, reason) => {
    if (!project?.id || !pageKey) return
    const existingApprovals = approvalsRef.current?.[pageKey] || {}
    const viewportsToClear = viewports?.length
      ? viewports
      : Object.keys(existingApprovals)
    const hasExisting = viewportsToClear.some((viewportKey) => existingApprovals[viewportKey])
    if (!hasExisting) return
    if (viewportsToClear.length === 0) return

    setApprovals((prev) => {
      const next = { ...prev }
      if (next[pageKey]) {
        const nextPage = { ...next[pageKey] }
        viewportsToClear.forEach((viewportKey) => {
          delete nextPage[viewportKey]
        })
        if (Object.keys(nextPage).length === 0) {
          delete next[pageKey]
        } else {
          next[pageKey] = nextPage
        }
      }
      return next
    })

    if (approvalNoticeTimeoutRef.current) {
      clearTimeout(approvalNoticeTimeoutRef.current)
    }
    setApprovalNotice('Approval cleared for this page due to changes.')
    approvalNoticeTimeoutRef.current = setTimeout(() => setApprovalNotice(null), 4000)

    try {
      const result = await api.saveApproval(project.id, {
        action: 'clear',
        pageKey,
        viewports: viewportsToClear,
        reason: reason || 'updated',
        actor: 'system'
      })
      setApprovals(result.approvals || {})
      setApprovalHistory(result.history || [])
    } catch (err) {
      console.error('Failed to clear approval:', err)
    }
  }, [project?.id])

  const handleApprovalConfirm = async () => {
    if (!approvalTarget || !project?.id) return
    const name = approverName.trim()
    if (!name) return

    setApprovalSaving(true)
    try {
      const commentCount = getPageCommentCount(approvalTarget.pageKey)
      const result = await api.saveApproval(project.id, {
        action: 'approve',
        pageKey: approvalTarget.pageKey,
        viewports: approvalTarget.viewports || approvalViewportsForCurrentPage,
        approverName: name,
        commentCount
      })
      setApprovals(result.approvals || {})
      setApprovalHistory(result.history || [])
      localStorage.setItem('approverName', name)
      setShowApprovalModal(false)
      setApprovalTarget(null)
    } catch (err) {
      console.error('Failed to save approval:', err)
    } finally {
      setApprovalSaving(false)
    }
  }

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

  // Keep refs in sync
  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  useEffect(() => {
    currentPageDataRef.current = currentPageData
  }, [currentPageData])

  useEffect(() => {
    dragStateRef.current = { ...dragStateRef.current, isDragging, draggedComment, dragOffset }
  }, [isDragging, draggedComment, dragOffset])

  const stopDragging = useCallback(() => {
    const target = dragTargetRef.current
    const pointerId = dragStateRef.current.pointerId
    const dragged = dragStateRef.current.draggedComment
    if (target && pointerId !== null && target.releasePointerCapture) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // Ignore release errors if capture isn't active.
      }
    }

    if (dragged && currentPageDataRef.current) {
      const pageKey = currentPageDataRef.current.relativePath || currentPageDataRef.current.path || 'default'
      const pageComments = commentsRef.current[pageKey] || []
      const latest = pageComments.find(comment => comment.id === dragged.id)
      if (latest && (latest.x !== dragged.x || latest.y !== dragged.y || latest.width !== dragged.width || latest.height !== dragged.height)) {
        const viewports = getApprovalViewportsForPage(currentPageDataRef.current)
        clearApprovalsForPage(pageKey, viewports, 'comment-moved')
      }
    }

    dragTargetRef.current = null
    dragStateRef.current = { isDragging: false, draggedComment: null, dragOffset: { x: 0, y: 0 }, pointerId: null }
    setIsDragging(false)
    setDraggedComment(null)
    setDragOffset({ x: 0, y: 0 })
  }, [clearApprovalsForPage])

  // Drag handlers for repositioning existing comments
  const handleCommentPointerDown = useCallback((e, comment) => {
    if (e.button !== 0 || !overlayRef.current) return
    e.stopPropagation()
    e.preventDefault()

    const rect = overlayRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Calculate offset from the comment's position to the mouse position
    const offset = {
      x: mouseX - comment.x,
      y: mouseY - comment.y
    }

    const target = e.currentTarget
    if (target && target.setPointerCapture) {
      target.setPointerCapture(e.pointerId)
    }
    dragTargetRef.current = target
    dragStateRef.current = {
      isDragging: true,
      draggedComment: comment,
      dragOffset: offset,
      pointerId: e.pointerId ?? null
    }
    setDragOffset(offset)
    setDraggedComment(comment)
    setIsDragging(true)
  }, [])

  const handleCommentMouseDown = useCallback((e, comment) => {
    if (typeof window !== 'undefined' && window.PointerEvent) return
    if (e.button !== 0 || !overlayRef.current) return
    e.stopPropagation()
    e.preventDefault()

    const rect = overlayRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const offset = {
      x: mouseX - comment.x,
      y: mouseY - comment.y
    }

    dragStateRef.current = { isDragging: true, draggedComment: comment, dragOffset: offset, pointerId: null }
    setDragOffset(offset)
    setDraggedComment(comment)
    setIsDragging(true)
  }, [])

  // Add document-level event listeners for dragging
  useEffect(() => {
    const handlePointerMove = (e) => {
      const { isDragging: dragging, draggedComment, dragOffset, pointerId } = dragStateRef.current
      if (!dragging || !draggedComment || !overlayRef.current) return
      if (pointerId !== null && e.pointerId !== pointerId) return

      const rect = overlayRef.current.getBoundingClientRect()
      const newX = e.clientX - rect.left - dragOffset.x
      const newY = e.clientY - rect.top - dragOffset.y

      // Update the dragged comment position in real-time (without history)
      const pageKey = currentPageDataRef.current.relativePath || currentPageDataRef.current.path
      const currentComments = commentsRef.current
      const pageComments = currentComments[pageKey] || []

      setComments({
        ...currentComments,
        [pageKey]: pageComments.map(c => {
          if (c.id === draggedComment.id) {
            return { ...c, x: Math.max(0, newX), y: Math.max(0, newY) }
          }
          return c
        })
      })
    }

    const handlePointerUp = (e) => {
      const { pointerId } = dragStateRef.current
      if (pointerId !== null && e.pointerId !== pointerId) return
      if (!dragStateRef.current.isDragging) return
      stopDragging()
    }

    const handleMouseMove = (e) => {
      const { isDragging: dragging, draggedComment, dragOffset } = dragStateRef.current
      if (!dragging || !draggedComment || !overlayRef.current) return

      const rect = overlayRef.current.getBoundingClientRect()
      const newX = e.clientX - rect.left - dragOffset.x
      const newY = e.clientY - rect.top - dragOffset.y

      const pageKey = currentPageDataRef.current.relativePath || currentPageDataRef.current.path
      const currentComments = commentsRef.current
      const pageComments = currentComments[pageKey] || []

      setComments({
        ...currentComments,
        [pageKey]: pageComments.map(c => {
          if (c.id === draggedComment.id) {
            return { ...c, x: Math.max(0, newX), y: Math.max(0, newY) }
          }
          return c
        })
      })
    }

    const handleMouseUp = () => {
      if (!dragStateRef.current.isDragging) return
      stopDragging()
    }

    const supportsPointer = typeof window !== 'undefined' && window.PointerEvent
    if (supportsPointer) {
      window.addEventListener('pointermove', handlePointerMove, { passive: false })
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
      window.addEventListener('blur', handlePointerUp)
      return () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
        window.removeEventListener('blur', handlePointerUp)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: false })
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseUp)
    }
  }, [stopDragging])

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

    updateCommentsWithHistory({
      ...comments,
      [pageKey]: [...pageComments, newComment]
    })
    clearApprovalsForPage(pageKey, approvalViewportsForCurrentPage, 'comment-added')

    setShowCommentInput(false)
    setTempPinPosition(null)
    setCommentText('')
  }

  const handleDeleteComment = (commentId, pageKeyOverride = null) => {
    const pageKey = pageKeyOverride || currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    const commentToDelete = pageComments.find(c => c.id === commentId)

    updateCommentsWithHistory({
      ...comments,
      [pageKey]: pageComments.filter(c => c.id !== commentId)
    })
    setActiveComment(null)
    if (commentToDelete?.viewport) {
      clearApprovalsForPage(pageKey, approvalViewportsForCurrentPage, 'comment-deleted')
    }
  }

  // Edit comment handler
  const handleEditComment = (commentId, newText, pageKeyOverride = null) => {
    if (!newText.trim()) return

    const pageKey = pageKeyOverride || currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    const commentToEdit = pageComments.find(c => c.id === commentId)

    updateCommentsWithHistory({
      ...comments,
      [pageKey]: pageComments.map(c =>
        c.id === commentId ? { ...c, text: newText } : c
      )
    })
    setEditingCommentId(null)
    setEditingText('')
    if (commentToEdit?.viewport) {
      clearApprovalsForPage(pageKey, approvalViewportsForCurrentPage, 'comment-edited')
    }
  }

  // Move comment handler (for drag/drop)
  const handleMoveComment = (commentId, newX, newY, newWidth = null, newHeight = null, pageKeyOverride = null) => {
    const pageKey = pageKeyOverride || currentPageData.relativePath || currentPageData.path
    const pageComments = comments[pageKey] || []
    const commentToMove = pageComments.find(c => c.id === commentId)

    updateCommentsWithHistory({
      ...comments,
      [pageKey]: pageComments.map(c => {
        if (c.id === commentId) {
          const updated = { ...c, x: newX, y: newY }
          if (newWidth !== null) updated.width = newWidth
          if (newHeight !== null) updated.height = newHeight
          return updated
        }
        return c
      })
    })
    if (commentToMove?.viewport) {
      clearApprovalsForPage(pageKey, approvalViewportsForCurrentPage, 'comment-moved')
    }
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

  // Helper to get iframe content for a specific page (for PDF generation)
  const getIframeContentForPage = (page) => {
    const pagePath = page.relativePath || page.path || ''

    if (project.assetKeys && project.assetKeys.length > 0) {
      // Cloud-based project - use the page URL endpoint
      return { type: 'url', content: api.getPageUrl(project.id, pagePath) }
    } else if (project.assets) {
      // Legacy local assets (base64 encoded) - use srcDoc
      let htmlContent = page.content || ''

      for (const [assetPath, assetData] of Object.entries(project.assets)) {
        const fileName = assetPath.split('/').pop()
        const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        htmlContent = htmlContent.replace(
          new RegExp(`(src|href)=["']([^"']*${escapedFileName})["']`, 'gi'),
          `$1="${assetData}"`
        )
      }

      return { type: 'srcdoc', content: htmlContent }
    } else {
      // Fallback - use content as-is
      return { type: 'srcdoc', content: page.content || '' }
    }
  }

  // Helper to capture HTML page in a temporary iframe
  const captureHtmlPageToCanvas = async (page, pageComments) => {
    return new Promise(async (resolve) => {
      const iframeData = getIframeContentForPage(page)

      // Create a hidden container
      const container = document.createElement('div')
      container.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 1200px; height: 800px; overflow: hidden;'
      document.body.appendChild(container)

      // Create temporary iframe
      const tempIframe = document.createElement('iframe')
      tempIframe.style.cssText = 'width: 1200px; height: 800px; border: none;'
      tempIframe.sandbox = 'allow-same-origin allow-scripts'

      container.appendChild(tempIframe)

      const cleanup = () => {
        try {
          document.body.removeChild(container)
        } catch (e) {
          // Container may have already been removed
        }
      }

      // Set up load handler
      const onLoad = async () => {
        try {
          // Wait a bit for content to render
          await new Promise(r => setTimeout(r, 500))

          let iframeDocument = null
          try {
            iframeDocument = tempIframe.contentDocument || tempIframe.contentWindow?.document
          } catch (e) {
            console.log('Cannot access temp iframe document:', e)
            cleanup()
            resolve(null)
            return
          }

          if (!iframeDocument || !iframeDocument.body) {
            cleanup()
            resolve(null)
            return
          }

          // Get the actual document dimensions for proper scaling
          const docWidth = iframeDocument.documentElement.scrollWidth || 1200
          const docHeight = iframeDocument.documentElement.scrollHeight || 800

          // Capture with html2canvas
          const canvas = await html2canvas(iframeDocument.body, {
            useCORS: true,
            allowTaint: true,
            scale: 1,
            logging: false,
            windowWidth: docWidth,
            windowHeight: docHeight
          })

          // Draw annotations on top
          const ctx = canvas.getContext('2d')

          // Comments are stored as pixel positions relative to the iframe width (1200px in our temp iframe)
          // The canvas captures the full document at that width
          // Scale based on canvas width vs temp iframe width (should be ~1 if matching)
          // Use the SAME scale for both X and Y to maintain correct positions
          const scale = canvas.width / 1200

          pageComments.forEach((comment, idx) => {
            const scaledX = comment.x * scale
            const scaledY = comment.y * scale

            if (comment.isRectangle && comment.width && comment.height) {
              ctx.strokeStyle = '#3b82f6'
              ctx.lineWidth = 3
              ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
              ctx.beginPath()
              ctx.rect(scaledX, scaledY, comment.width * scale, comment.height * scale)
              ctx.fill()
              ctx.stroke()

              ctx.fillStyle = '#3b82f6'
              ctx.beginPath()
              ctx.arc(scaledX - 8, scaledY - 8, 14, 0, Math.PI * 2)
              ctx.fill()
              ctx.fillStyle = 'white'
              ctx.font = 'bold 12px Arial'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(String(idx + 1), scaledX - 8, scaledY - 8)
            } else {
              ctx.fillStyle = '#3b82f6'
              ctx.beginPath()
              ctx.arc(scaledX, scaledY, 16, 0, Math.PI * 2)
              ctx.fill()
              ctx.fillStyle = 'white'
              ctx.font = 'bold 14px Arial'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(String(idx + 1), scaledX, scaledY)
            }
          })

          cleanup()
          resolve(canvas)
        } catch (err) {
          console.error('Failed to capture temp iframe:', err)
          cleanup()
          resolve(null)
        }
      }

      tempIframe.addEventListener('load', onLoad)

      // Set a timeout in case loading hangs
      setTimeout(() => {
        cleanup()
        resolve(null)
      }, 10000)

      // Load the content
      if (iframeData.type === 'url') {
        tempIframe.src = iframeData.content
      } else {
        tempIframe.srcdoc = iframeData.content
      }
    })
  }

  const generatePDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)

    // Title page
    pdf.setFontSize(24)
    pdf.setFont(undefined, 'bold')
    pdf.text(project.name, margin, 35)

    pdf.setFontSize(14)
    pdf.setFont(undefined, 'normal')
    pdf.text(`Client: ${project.clientName || 'N/A'}`, margin, 48)

    pdf.setFontSize(12)
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, margin, 58)

    const totalComments = Object.values(comments).flat().length
    pdf.text(`Total Comments: ${totalComments}`, margin, 68)

    // Add a separator line
    pdf.setDrawColor(200)
    pdf.line(margin, 75, pageWidth - margin, 75)

    let yPosition = 85

    // Process each page with comments
    for (const page of project.pages) {
      const pageKey = page.relativePath || page.path
      const pageComments = comments[pageKey] || []

      if (pageComments.length === 0) continue

      // Start new page for each annotated page
      pdf.addPage()
      yPosition = margin

      const pageName = pageKey.split('/').pop() || page.name || 'Page'

      // Page header
      pdf.setFontSize(16)
      pdf.setFont(undefined, 'bold')
      pdf.setTextColor(60, 60, 60)
      pdf.text(`Page: ${pageName}`, margin, yPosition + 5)
      pdf.setTextColor(0)
      yPosition += 15

      // Try to capture a screenshot of the page with annotations
      let screenshotAdded = false

      // For image projects, use the image directly
      if (isImageProject && page.variants) {
        const variant = page.variants[viewport] || page.variants.desktop || page.variants.tablet || page.variants.mobile
        if (variant?.url) {
          try {
            // Create a canvas with the image and draw annotations on it
            const img = new Image()
            img.crossOrigin = 'anonymous'

            await new Promise((resolve, reject) => {
              img.onload = resolve
              img.onerror = reject
              img.src = variant.url
            })

            // Create canvas to draw image with annotations
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            // Scale down if image is too large
            const maxWidth = 800
            const scale = img.width > maxWidth ? maxWidth / img.width : 1
            canvas.width = img.width * scale
            canvas.height = img.height * scale

            // Draw the image
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

            // Draw annotations on top
            pageComments.forEach((comment, idx) => {
              const scaledX = comment.x * scale
              const scaledY = comment.y * scale

              if (comment.isRectangle && comment.width && comment.height) {
                // Draw rectangle
                ctx.strokeStyle = '#3b82f6'
                ctx.lineWidth = 3
                ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
                ctx.beginPath()
                ctx.rect(scaledX, scaledY, comment.width * scale, comment.height * scale)
                ctx.fill()
                ctx.stroke()

                // Draw number badge
                ctx.fillStyle = '#3b82f6'
                ctx.beginPath()
                ctx.arc(scaledX - 8, scaledY - 8, 14, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = 'white'
                ctx.font = 'bold 12px Arial'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(String(idx + 1), scaledX - 8, scaledY - 8)
              } else {
                // Draw pin marker
                ctx.fillStyle = '#3b82f6'
                ctx.beginPath()
                ctx.arc(scaledX, scaledY, 16, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = 'white'
                ctx.font = 'bold 12px Arial'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(String(idx + 1), scaledX, scaledY)
              }
            })

            // Add annotated image to PDF
            const imgData = canvas.toDataURL('image/jpeg', 0.8)
            const imgAspect = canvas.height / canvas.width
            const pdfImgWidth = contentWidth
            const pdfImgHeight = pdfImgWidth * imgAspect

            // Check if image fits on current page
            const maxImgHeight = pageHeight - yPosition - 30
            const finalImgHeight = Math.min(pdfImgHeight, maxImgHeight)
            const finalImgWidth = finalImgHeight / imgAspect

            pdf.addImage(imgData, 'JPEG', margin, yPosition, finalImgWidth, finalImgHeight)
            yPosition += finalImgHeight + 10
            screenshotAdded = true
          } catch (err) {
            console.error('Failed to add image to PDF:', err)
          }
        }
      }

      // For HTML projects, capture each page in a temporary iframe
      if (!screenshotAdded && !isImageProject) {
        try {
          const canvas = await captureHtmlPageToCanvas(page, pageComments)

          if (canvas) {
            const imgData = canvas.toDataURL('image/jpeg', 0.85)
            const imgAspect = canvas.height / canvas.width
            const pdfImgWidth = contentWidth
            const pdfImgHeight = pdfImgWidth * imgAspect

            // Check if image fits on current page
            const maxImgHeight = pageHeight - yPosition - 30
            const finalImgHeight = Math.min(pdfImgHeight, maxImgHeight)
            const finalImgWidth = finalImgHeight / imgAspect

            pdf.addImage(imgData, 'JPEG', margin, yPosition, finalImgWidth, finalImgHeight)
            yPosition += finalImgHeight + 10
            screenshotAdded = true
          }
        } catch (err) {
          console.error('Failed to capture HTML page:', err)
        }
      }

      // Add comments list
      if (!screenshotAdded) {
        // Add a note that screenshot couldn't be captured
        pdf.setFontSize(10)
        pdf.setTextColor(120, 120, 120)
        pdf.text('Note: Screenshot not available for this page type.', margin, yPosition)
        yPosition += 5
        pdf.text('Please refer to the position coordinates below.', margin, yPosition)
        pdf.setTextColor(0)
        yPosition += 12
      }

      // Add comment details
      pdf.setFontSize(12)
      pdf.setFont(undefined, 'bold')
      pdf.text('Feedback Comments:', margin, yPosition)
      yPosition += 8

      for (let i = 0; i < pageComments.length; i++) {
        const comment = pageComments[i]

        // Check if we need a new page
        if (yPosition > pageHeight - 40) {
          pdf.addPage()
          yPosition = margin
        }

        // Comment number with background
        pdf.setFillColor(59, 130, 246)
        pdf.circle(margin + 4, yPosition + 1, 4, 'F')
        pdf.setFontSize(9)
        pdf.setTextColor(255, 255, 255)
        pdf.text(`${i + 1}`, margin + 2.5, yPosition + 2.5)
        pdf.setTextColor(0)

        // Comment text
        pdf.setFontSize(11)
        pdf.setFont(undefined, 'normal')
        const lines = pdf.splitTextToSize(comment.text, contentWidth - 15)
        pdf.text(lines, margin + 12, yPosition + 3)

        const textHeight = lines.length * 5
        yPosition += textHeight + 5

        // Location description
        pdf.setFontSize(9)
        pdf.setTextColor(100, 100, 100)
        let locationDesc = ''
        if (comment.isRectangle && comment.width && comment.height) {
          locationDesc = `Location: Highlighted area at (${Math.round(comment.x)}, ${Math.round(comment.y)}) - ${Math.round(comment.width)}x${Math.round(comment.height)} px`
        } else {
          locationDesc = `Location: Point marker at (${Math.round(comment.x)}, ${Math.round(comment.y)})`
        }
        pdf.text(locationDesc, margin + 12, yPosition)
        pdf.setTextColor(0)

        yPosition += 10
      }
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

    if (project.assetKeys && project.assetKeys.length > 0) {
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
    const shareUrl = api.getShareUrl(project.id, { client: true })
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
  const approvalProgressPercent = approvalProgress.total > 0
    ? Math.round((approvalProgress.approved / approvalProgress.total) * 100)
    : 0
  const approvalTargetLabel = approvalTarget
    ? formatViewportList(approvalTarget.viewports || approvalViewportsForCurrentPage)
    : ''
  const approvalTargetCommentCount = approvalTarget
    ? getPageCommentCount(approvalTarget.pageKey)
    : 0

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Main App Header - same as Dashboard */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            {isClientView ? (
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
            ) : (
              <a href="/" className="flex items-center gap-3" title="Go to projects dashboard">
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
            )}
            {!isClientView && (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search projects..."
                  title="Search projects"
                  className="pl-10 pr-4 py-2 bg-neutral-100 border border-neutral-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={onBack}
                  title="Return to the projects dashboard"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  + New Project
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Action Bar - Back, Share, Add Comments, Export PDF */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-full mx-auto px-6 py-3">
          <div className={`flex items-center ${isClientView ? 'justify-end' : 'justify-between'}`}>
            {!isClientView && (
              <button
                onClick={onBack}
                title="Back to projects"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
            )}

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-sm text-neutral-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-neutral-500"></div>
                  Saving...
                </span>
              )}

              {approvalSaving && (
                <span className="text-sm text-neutral-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-neutral-500"></div>
                  Recording approval...
                </span>
              )}

              {canUndo && (
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-2 px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                  title="Undo last action"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
              )}

              <button
                onClick={copyShareUrl}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                title="Copy client share link"
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
                title={commentMode ? 'Exit comment mode' : 'Add feedback by clicking or dragging on the page'}
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
                onClick={() => requestApproval(currentPageKey, approvalViewportsForCurrentPage)}
                disabled={currentPageApproval.approved}
                title={
                  currentPageApproval.approved
                    ? `Approved ${formatTimestamp(currentPageApproval.latestApproval?.approvedAt)}`
                    : `Approve this page (${formatViewportList(approvalViewportsForCurrentPage)})`
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  currentPageApproval.approved
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <Check className="w-4 h-4" />
                {currentPageApproval.approved ? 'Approved' : 'Approve Page'}
              </button>

              <button
                onClick={generatePDF}
                title="Export a PDF summary of feedback"
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
                    title={`Switch to ${label} view`}
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

            <div className="flex-1 flex flex-wrap gap-2 overflow-x-auto">
              {project.pages.map((page, index) => {
                const { approved } = getPageApprovalStatus(page)
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentPage(index)}
                    title={`Open ${page.name}`}
                    className={`px-3 py-2 rounded-lg whitespace-nowrap transition-colors text-sm flex items-center gap-2 ${
                      currentPage === index
                        ? 'bg-neutral-800 text-white'
                        : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                    }`}
                  >
                    <span>{page.name}</span>
                    {approved && (
                      <Check className={`w-3 h-3 ${currentPage === index ? 'text-emerald-200' : 'text-emerald-600'}`} />
                    )}
                  </button>
                )
              })}
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
                  // Use key to force remount when URL changes, preventing flash of old image
                  const imageKey = `${project.id}-${variant.path}`
                  return (
                    <div className="relative">
                      {imageLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
                          <div className="w-8 h-8 border-3 border-neutral-300 border-t-indigo-600 rounded-full animate-spin"></div>
                        </div>
                      )}
                      <img
                        key={imageKey}
                        src={imageUrl}
                        alt={currentPageData.name}
                        className={`w-full h-auto block transition-opacity duration-150 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                        style={{ maxWidth: '100%' }}
                        onLoadStart={() => {
                          if (loadedImageUrl !== imageUrl) {
                            setImageLoading(true)
                          }
                        }}
                        onLoad={() => {
                          setImageLoading(false)
                          setLoadedImageUrl(imageUrl)
                        }}
                      />
                    </div>
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
                className={`comment-overlay ${commentMode ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
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
                      className={`comment-rect ${activeComment === comment.id ? 'active' : ''} ${draggedComment?.id === comment.id ? 'dragging' : ''}`}
                      style={{
                        left: `${comment.x}px`,
                        top: `${comment.y}px`,
                        width: `${comment.width}px`,
                        height: `${comment.height}px`,
                        cursor: 'grab'
                      }}
                      onClick={(e) => {
                        if (!isDragging) {
                          e.stopPropagation()
                          setActiveComment(activeComment === comment.id ? null : comment.id)
                        }
                      }}
                      onPointerDown={(e) => handleCommentPointerDown(e, comment)}
                      onMouseDown={(e) => handleCommentMouseDown(e, comment)}
                      title="Drag to reposition"
                    >
                      <span className="comment-rect-number">
                        {index + 1}
                      </span>
                    </div>
                  ) : (
                    // Point pin annotation
                    <div
                      key={comment.id}
                      className={`comment-pin ${activeComment === comment.id ? 'active' : ''} ${draggedComment?.id === comment.id ? 'dragging' : ''}`}
                      style={{ left: `${comment.x}px`, top: `${comment.y}px` }}
                      onClick={(e) => {
                        if (!isDragging) {
                          e.stopPropagation()
                          setActiveComment(activeComment === comment.id ? null : comment.id)
                        }
                      }}
                      onPointerDown={(e) => handleCommentPointerDown(e, comment)}
                      onMouseDown={(e) => handleCommentMouseDown(e, comment)}
                      title="Drag to reposition"
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
            <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800">Quick guide</h2>
                  <p className="text-xs text-neutral-500">How to leave feedback and approve.</p>
                </div>
                <HelpCircle className="w-4 h-4 text-neutral-400" />
              </div>
              <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-neutral-600">
                <li>Select a page tab to review.</li>
                <li>Click Add Comments, then click or drag on the page.</li>
                <li>Write your feedback and save it.</li>
                <li>Approve the page when you are happy.</li>
              </ol>
              <button
                onClick={() => setShowGuide(true)}
                title="Open the full review guide"
                className="mt-3 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Open guide
              </button>
            </div>
            <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800">Approval status</h2>
                  <p className="text-xs text-neutral-500">
                    Pages approved: {approvalProgress.approved}/{approvalProgress.total}
                  </p>
                </div>
                {approvalProgress.total > 0 && (
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                    approvalProgress.approved === approvalProgress.total
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {approvalProgress.approved === approvalProgress.total ? 'All approved' : 'In review'}
                  </span>
                )}
              </div>

              <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${approvalProgressPercent}%` }}
                />
              </div>

              <div className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {currentPageApproval.approved ? (
                      <Check className="w-4 h-4 text-emerald-600 mt-0.5" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600 mt-0.5" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-neutral-800">This page</div>
                      <div className="text-xs text-neutral-500">
                        {currentPageApproval.approved
                          ? `Approved ${formatTimestamp(currentPageApproval.latestApproval?.approvedAt)}`
                          : 'Needs review'}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Covers {formatViewportList(approvalViewportsForCurrentPage)}
                      </div>
                      {currentPageApproval.latestApproval?.approvedBy && (
                        <div className="text-[11px] text-neutral-400">
                          by {currentPageApproval.latestApproval.approvedBy}
                        </div>
                      )}
                    </div>
                  </div>
                  {currentPageApproval.approved ? (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                      Approved
                    </span>
                  ) : (
                    <button
                      onClick={() => requestApproval(currentPageKey, approvalViewportsForCurrentPage)}
                      title="Approve this page"
                      className="text-xs font-semibold px-2 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                    >
                      Approve page
                    </button>
                  )}
                </div>
              </div>

              {approvalNotice && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800">
                  {approvalNotice}
                </div>
              )}

              {pageApprovalHistory.length > 0 && (
                <div className="mt-3 border-t border-neutral-200 pt-3">
                  <div className="text-xs font-semibold text-neutral-600 mb-2">Recent activity</div>
                  <div className="space-y-1">
                    {pageApprovalHistory.map((entry) => {
                      const actionLabel = entry.action === 'approved' ? 'Approved' : 'Cleared'
                      const viewportLabel = entry.viewports?.length
                        ? formatViewportList(entry.viewports)
                        : (APPROVAL_LABELS[entry.viewport] || entry.viewport || 'views')
                      const historyTime = entry.timestamp || entry.approvedAt || entry.clearedAt
                      return (
                        <div key={entry.id} className="text-[11px] text-neutral-500">
                          {actionLabel} {viewportLabel} · {formatTimestamp(historyTime)}
                          {entry.actor ? ` · ${entry.actor}` : ''}
                          {entry.action === 'cleared' && entry.reason ? ` · ${entry.reason}` : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Toggle between page comments and all comments */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setShowAllComments(false)}
                title="Show comments for the current page"
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
                title="Show comments across all pages"
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingCommentId(comment.id)
                              setEditingText(comment.text)
                            }}
                            className="text-blue-500 hover:text-blue-700 text-xs flex items-center gap-1"
                            title="Edit comment"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
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
                      </div>
                      {editingCommentId === comment.id ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm"
                            rows="3"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditComment(comment.id, editingText)}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingCommentId(null)
                                setEditingText('')
                              }}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm mb-2">{comment.text}</p>
                      )}
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

      {showGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold">Review guide</h3>
                <p className="text-sm text-neutral-600">A quick walkthrough for reviewers.</p>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-700"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-sm text-neutral-700">
              <div>
                <h4 className="font-semibold text-neutral-800">1. Choose a page and view</h4>
                <p>Use the page tabs and the Desktop, Tablet, Mobile buttons to switch views.</p>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-800">2. Add comments</h4>
                <p>Click Add Comments, then click for a pin or drag to highlight an area.</p>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-800">3. Review and refine</h4>
                <p>Use the right panel to read, edit, or delete feedback as needed.</p>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-800">4. Approve when ready</h4>
                <p>Click Approve Page and enter your name to record approval.</p>
              </div>
            </div>

            <div className="mt-5">
              <button
                onClick={() => setShowGuide(false)}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

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

      {showApprovalModal && approvalTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Approve this page</h3>
            <p className="text-sm text-neutral-600 mb-4">
              You are approving <span className="font-semibold text-neutral-800">{approvalTarget.pageName}</span> for
              <span className="font-semibold text-neutral-800"> {approvalTargetLabel}</span> views.
              {approvalTargetCommentCount > 0 ? ` ${approvalTargetCommentCount} comment${approvalTargetCommentCount > 1 ? 's' : ''} logged.` : ' No comments logged.'}
            </p>

            <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Approved by</label>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Client name"
              className="w-full border rounded px-3 py-2 mt-2 mb-4 text-sm"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowApprovalModal(false)
                  setApprovalTarget(null)
                }}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
                disabled={approvalSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleApprovalConfirm}
                disabled={!approverName.trim() || approvalSaving}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {approvalSaving ? 'Saving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
