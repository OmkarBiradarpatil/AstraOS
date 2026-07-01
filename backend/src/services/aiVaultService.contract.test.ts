import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAiVaultDocument, listAiVaultDocuments, registerAiVaultDocument } from './aiVaultService.js'

const vaultMock = vi.hoisted(() => ({
  createDocument: vi.fn(),
  deleteChunks: vi.fn(),
  findDocument: vi.fn(),
  getAssetMetadata: vi.fn(),
  insertChunks: vi.fn(),
  deleteAsset: vi.fn(),
}))

vi.mock('./database.js', () => ({
  connectMongo: vi.fn(async () => undefined),
  isMongoConfigured: vi.fn(() => true),
}))

vi.mock('./cloudinaryService.js', () => ({
  deleteUserCloudinaryAsset: vaultMock.deleteAsset,
  getUserCloudinaryAssetMetadata: vaultMock.getAssetMetadata,
}))

vi.mock('../models/aiVaultDocument.js', () => ({
  AiVaultDocumentModel: {
    create: vaultMock.createDocument,
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(async () => []),
        })),
      })),
    })),
    findOne: vaultMock.findDocument,
  },
}))

vi.mock('../models/aiVaultChunk.js', () => ({
  AiVaultChunkModel: {
    deleteMany: vaultMock.deleteChunks,
    insertMany: vaultMock.insertChunks,
  },
}))

const uploadInput = {
  bytes: 1000,
  cloudinaryPublicId: 'astraos/user_a/ai-vault/default/vault-file',
  cloudinaryResourceType: 'raw' as const,
  contentHash: 'content-hash-123',
  contentType: 'application/pdf',
  originalFilename: 'brief.pdf',
  sourceType: 'upload' as const,
  tags: ['folder:default'],
  title: 'brief.pdf',
}

describe('AI Vault upload metadata contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vaultMock.deleteAsset.mockResolvedValue({ result: 'ok' })
    vaultMock.deleteChunks.mockResolvedValue({ deletedCount: 1 })
    vaultMock.findDocument.mockResolvedValue(null)
    vaultMock.createDocument.mockImplementation(async (payload) => ({ _id: 'doc_id', ...payload }))
  })

  it('rejects uploaded asset metadata with the wrong Cloudinary owner context', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 1000,
      context: { custom: { content_type: 'application/pdf', owner_id: 'user_b' } },
    })

    await expect(registerAiVaultDocument({ userId: 'user_a' }, uploadInput))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ASSET', status: 403 })
    expect(vaultMock.createDocument).not.toHaveBeenCalled()
  })

  it('rejects uploaded asset metadata without signed owner context', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 1000,
      context: { custom: { content_type: 'application/pdf' } },
    })

    await expect(registerAiVaultDocument({ userId: 'user_a' }, uploadInput))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ASSET', status: 403 })
    expect(vaultMock.createDocument).not.toHaveBeenCalled()
  })

  it('rejects uploaded asset byte mismatches', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 999,
      context: { custom: { content_type: 'application/pdf', owner_id: 'user_a' } },
    })

    await expect(registerAiVaultDocument({ userId: 'user_a' }, uploadInput))
      .rejects.toMatchObject({ code: 'ASSET_BYTES_MISMATCH', status: 400 })
    expect(vaultMock.createDocument).not.toHaveBeenCalled()
  })

  it('rejects uploaded asset content-type mismatches', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 1000,
      context: { custom: { content_type: 'text/plain', owner_id: 'user_a' } },
    })

    await expect(registerAiVaultDocument({ userId: 'user_a' }, uploadInput))
      .rejects.toMatchObject({ code: 'ASSET_CONTENT_TYPE_MISMATCH', status: 400 })
    expect(vaultMock.createDocument).not.toHaveBeenCalled()
  })

  it('rejects uploaded asset metadata without signed content type context', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 1000,
      context: { custom: { owner_id: 'user_a' } },
    })

    await expect(registerAiVaultDocument({ userId: 'user_a' }, uploadInput))
      .rejects.toMatchObject({ code: 'ASSET_CONTENT_TYPE_MISMATCH', status: 400 })
    expect(vaultMock.createDocument).not.toHaveBeenCalled()
  })

  it('persists trusted ownership after valid Cloudinary metadata verification', async () => {
    vaultMock.getAssetMetadata.mockResolvedValue({
      bytes: 1000,
      context: { custom: { content_type: 'application/pdf', owner_id: 'user_a' } },
    })

    const document = await registerAiVaultDocument({ userId: 'user_a', orgId: 'org_a' }, uploadInput)

    expect(vaultMock.getAssetMetadata).toHaveBeenCalledWith(
      'user_a',
      'astraos/user_a/ai-vault/default/vault-file',
      'raw',
    )
    expect(vaultMock.createDocument).toHaveBeenCalledWith(expect.objectContaining({
      cloudinaryPublicId: 'astraos/user_a/ai-vault/default/vault-file',
      contentType: 'application/pdf',
      orgId: 'org_a',
      ownerId: 'user_a',
      status: 'queued',
    }))
    expect(document).toMatchObject({ _id: 'doc_id', ownerId: 'user_a' })
  })

  it('deletes provider asset, chunks, and soft-deletes the document', async () => {
    const save = vi.fn(async () => undefined)
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      cloudinaryPublicId: 'astraos/user_a/ai-vault/default/vault-file',
      cloudinaryResourceType: 'raw',
      deletedAt: null as Date | null,
      save,
    }
    vaultMock.findDocument.mockResolvedValue(doc)

    const result = await deleteAiVaultDocument({ userId: 'user_a' }, '507f1f77bcf86cd799439011')

    expect(vaultMock.findDocument).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      deletedAt: null,
      ownerId: 'user_a',
    })
    expect(vaultMock.deleteAsset).toHaveBeenCalledWith(
      'user_a',
      'astraos/user_a/ai-vault/default/vault-file',
      'raw',
    )
    expect(vaultMock.deleteChunks).toHaveBeenCalledWith({
      documentId: '507f1f77bcf86cd799439011',
      ownerId: 'user_a',
    })
    expect(doc.deletedAt).toBeInstanceOf(Date)
    expect(save).toHaveBeenCalled()
    expect(result).toEqual({ deleted: true, id: '507f1f77bcf86cd799439011' })
  })

  it('lists documents with composite cursor filters', async () => {
    const { AiVaultDocumentModel } = await import('../models/aiVaultDocument.js')

    await listAiVaultDocuments(
      { userId: 'user_a' },
      { cursor: '2026-06-08T10:00:00.000Z|507f1f77bcf86cd799439011' },
    )

    expect(AiVaultDocumentModel.find).toHaveBeenCalledWith({
      ownerId: 'user_a',
      deletedAt: null,
      $or: [
        { updatedAt: { $lt: new Date('2026-06-08T10:00:00.000Z') } },
        {
          updatedAt: new Date('2026-06-08T10:00:00.000Z'),
          _id: { $lt: '507f1f77bcf86cd799439011' },
        },
      ],
    })
  })
})
