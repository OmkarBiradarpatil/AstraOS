import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { mergeRemoteWithLocal, restoreDeletedItem } from '../../lib/api/cloudMerge'
import { getAllCloudDocuments } from '../../lib/api/cloudPagination'
import {
  asNumber,
  asString,
  asStringArray,
  cloudRecordId,
  isMongoId,
  isoString,
  type CloudRecord,
} from '../../lib/api/cloudRecords'
import { nowIso, todayIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { DiaryEntry, VaultFile, VaultFolder, VaultSection } from '../../types/domain'
import { uploadVaultFile, VaultUploadRegistrationError, type UploadSignatureResponse } from './vaultUpload'

const initialSections: VaultSection[] = []

const initialFolders: VaultFolder[] = []

const initialFiles: VaultFile[] = []

const initialUploadRepairs: Record<string, unknown>[] = []

function stableHash(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `vault_${(hash >>> 0).toString(16)}`
}

function folderIdFromTags(tags: string[], fallback: string) {
  const tag = tags.find((item) => item.startsWith('folder:'))
  return tag ? tag.slice('folder:'.length) : fallback
}

function toVaultFile(record: CloudRecord, fallbackFolderId: string): VaultFile {
  const tags = asStringArray(record.tags)
  return {
    id: cloudRecordId(record, uid('file')),
    folderId: folderIdFromTags(tags, fallbackFolderId),
    name: asString(record.originalFilename, asString(record.title, 'Vault document')),
    size: asNumber(record.bytes, 0),
    type: asString(record.contentType, 'application/octet-stream'),
    createdAt: isoString(record.createdAt),
  }
}

function toDocumentPayload(file: VaultFile) {
  return {
    title: file.name,
    sourceType: 'upload',
    originalFilename: file.name,
    contentType: file.type,
    bytes: file.size,
    contentHash: stableHash(`${file.folderId}:${file.name}:${file.size}:${file.type}`),
    tags: [`folder:${file.folderId}`],
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Vault cloud sync failed.'
}

export function useVaultData() {
  const [sections, setSections] = usePersistentState<VaultSection[]>(
    'astraos.vault.sections',
    initialSections,
  )
  const [folders, setFolders] = usePersistentState<VaultFolder[]>(
    'astraos.vault.folders',
    initialFolders,
  )
  const [files, setFiles] = usePersistentState<VaultFile[]>('astraos.vault.files', initialFiles)
  const [uploadRepairs, setUploadRepairs] = usePersistentState<Record<string, unknown>[]>(
    'astraos.vault.uploadRepairs',
    initialUploadRepairs,
  )
  const [diaryEntries, setDiaryEntries] = usePersistentState<DiaryEntry[]>('astraos.diary.entries', [])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false

    async function loadVaultDocuments() {
      setIsLoading(true)
      try {
        const response = await getAllCloudDocuments('/ai-vault/documents')
        if (cancelled) return
        const fallbackFolderId = folders[0]?.id ?? ''
        const remoteFiles = response.map((record) => toVaultFile(record, fallbackFolderId))
        if (remoteFiles.length) setFiles((current) => mergeRemoteWithLocal(remoteFiles, current))
        setError(null)
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadVaultDocuments()
    return () => {
      cancelled = true
    }
  }, [cloudConfigured, folders, setFiles])

  return useMemo(
    () => ({
      sections,
      folders,
      files,
      diaryEntries,
      isLoading,
      isUploading,
      uploadStatus,
      error,
      uploadRepairs,
      isCloudBacked: cloudConfigured && !error,
      addSection(input: { name: string; color: string }) {
        const name = input.name.trim()
        if (!name) return
        setSections((current) => [
          { id: uid('section'), name, color: input.color || '#64748b', createdAt: nowIso() },
          ...current,
        ])
      },
      addFolder(input: { sectionId: string; name: string }) {
        const name = input.name.trim()
        if (!name || !input.sectionId) return
        setFolders((current) => [{ id: uid('folder'), sectionId: input.sectionId, name, createdAt: nowIso() }, ...current])
      },
      async createUploadSignature(input: { folderId: string; name: string; size: number; type: string }) {
        if (!cloudConfigured) throw new Error('AstraOS API is not configured.')
        return apiClient.post<UploadSignatureResponse>('/uploads/signature', {
          folder: `ai-vault/${input.folderId}`,
          contentType: input.type.trim() || 'application/octet-stream',
          bytes: Math.max(1, Math.round(input.size)),
          resourceType: 'raw',
        }, {
          headers: {
            'x-idempotency-key': stableHash(`signature:${input.folderId}:${input.name}:${input.size}:${input.type}:${nowIso()}`),
          },
        })
      },
      async addVirtualFile(input: { folderId: string; name: string; size: number; type: string }) {
        const name = input.name.trim()
        if (!name || !input.folderId) return
        const file: VaultFile = {
          id: uid('file'),
          folderId: input.folderId,
          name,
          size: Math.max(0, Math.round(input.size)),
          type: input.type.trim() || 'application/octet-stream',
          createdAt: nowIso(),
        }
        setFiles((current) => [file, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/ai-vault/documents', toDocumentPayload(file), {
            headers: { 'x-idempotency-key': file.id },
          })
          setFiles((current) => current.map((item) => (item.id === file.id ? toVaultFile(created, file.folderId) : item)))
          setError(null)
        } catch (caught) {
          setFiles((current) => current.filter((item) => item.id !== file.id))
          setError(errorMessage(caught))
        }
      },
      async uploadFile(input: { folderId: string; file: File }) {
        if (!cloudConfigured) {
          const message = 'AstraOS API is not configured. File upload stayed local-safe.'
          setError(message)
          setUploadStatus(message)
          return
        }

        setIsUploading(true)
        setUploadStatus('Preparing secure upload...')
        try {
          const created = await uploadVaultFile(input)
          const uploaded = toVaultFile(created, input.folderId)
          setFiles((current) => [uploaded, ...current])
          setError(null)
          setUploadStatus('Upload complete. AI Vault metadata is cloud-backed.')
        } catch (caught) {
          if (caught instanceof VaultUploadRegistrationError) {
            setUploadRepairs((current) => [caught.recovery, ...current])
          }
          const message = errorMessage(caught)
          setError(message)
          setUploadStatus(message)
        } finally {
          setIsUploading(false)
        }
      },
      addDiaryEntry(input: { title: string; body: string }) {
        const title = input.title.trim()
        const body = input.body.trim()
        if (!title && !body) return
        setDiaryEntries((current) => [
          {
            id: uid('diary'),
            title: title || 'Untitled entry',
            body,
            date: todayIso(),
            updatedAt: nowIso(),
          },
          ...current,
        ])
      },
      async removeFile(id: string) {
        const previous = files
        setFiles((current) => current.filter((file) => file.id !== id))
        if (!cloudConfigured || !isMongoId(id)) return

        try {
          await apiClient.delete(`/ai-vault/documents/${id}`)
          setError(null)
        } catch (caught) {
          const deleted = previous.find((file) => file.id === id)
          if (deleted) setFiles((current) => restoreDeletedItem(deleted, current))
          setError(errorMessage(caught))
        }
      },
      removeDiaryEntry(id: string) {
        setDiaryEntries((current) => current.filter((entry) => entry.id !== id))
      },
    }),
    [
      diaryEntries,
      cloudConfigured,
      error,
      files,
      folders,
      isLoading,
      isUploading,
      uploadStatus,
      sections,
      setDiaryEntries,
      setFiles,
      setFolders,
      setSections,
      setUploadRepairs,
      uploadRepairs,
    ],
  )
}
