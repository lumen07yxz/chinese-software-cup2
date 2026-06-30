import { useState, useEffect, useRef, useCallback } from 'react'

export interface ImageItem {
  file: File
  preview: string   // object URL for display
  base64: string    // data URL for API
}

interface ImageUploaderProps {
  images: ImageItem[]
  onChange: (images: ImageItem[]) => void
  maxCount?: number
  maxSize?: number  // max file size in bytes
}

/** 压缩图片到最大尺寸 */
function compressImage(file: File, maxDim = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function ImageUploader({ images, onChange, maxCount = 4, maxSize = 10 * 1024 * 1024 }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
  }, [])

  // 处理文件选择
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const remaining = maxCount - images.length
    if (remaining <= 0) return

    const newImages: ImageItem[] = []
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue
      if (file.size > maxSize) continue
      const base64 = await compressImage(file)
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        base64,
      })
    }
    if (newImages.length > 0) {
      onChange([...images, ...newImages])
    }
  }, [images, onChange, maxCount, maxSize])

  // 粘贴监听
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        handleFiles(imageFiles)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleFiles])

  // 清理 object URLs
  useEffect(() => {
    return () => { images.forEach((img) => URL.revokeObjectURL(img.preview)) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(images[idx].preview)
    onChange(images.filter((_, i) => i !== idx))
  }

  const canAdd = images.length < maxCount

  return (
    <div className="flex flex-col gap-2">
      {/* 按钮组 */}
      {canAdd && (
        <div className="flex items-center gap-2">
          {/* 上传按钮 - 始终显示 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="上传图片"
          >
            <span>📎</span>
            <span className="hidden sm:inline">上传图片</span>
          </button>

          {/* 拍照按钮 - 仅移动端 */}
          {isMobile && (
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="拍照"
            >
              <span>📷</span>
              <span>拍照</span>
            </button>
          )}

          {/* 粘贴提示 - 仅桌面端 */}
          {!isMobile && images.length === 0 && (
            <span className="text-[11px] text-gray-400">或 Ctrl+V 粘贴截图</span>
          )}

          {/* 文件数量 */}
          <span className="text-[11px] text-gray-400 ml-auto">
            {images.length}/{maxCount}
          </span>

          {/* 隐藏的 file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={images.length < maxCount}
            className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {/* 图片预览 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-black/30 text-white text-[9px] text-center py-0.5 truncate px-1">
                {img.file.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
