import { describe, expect, it, vi } from 'vitest'
import {
  buildCloudinaryUploadFormData,
  type UploadSignatureResponse,
  VaultUploadRegistrationError,
  type VaultUploadDependencies,
  uploadVaultFile,
  validateVaultUploadFile,
} from './vaultUpload'

const signature: UploadSignatureResponse = {
  apiKey: 'api-key',
  cloudName: 'astra-cloud',
  folder: 'astraos/user/ai-vault/folder_1',
  publicId: 'vault-public-id',
  resourceType: 'raw',
  signature: 'signed',
  timestamp: 1780920000,
  uploadParams: {
    context: 'owner_id=user|content_type=application/pdf|bytes=10',
    folder: 'astraos/user/ai-vault/folder_1',
    overwrite: 'false',
    public_id: 'vault-public-id',
    resource_type: 'raw',
    signature: 'signed',
    timestamp: 1780920000,
    unique_filename: 'false',
  },
}

function file(name = 'brief.pdf', type = 'application/pdf', body = 'vault file') {
  return new File([body], name, { type })
}

function dependencies(overrides: Partial<VaultUploadDependencies> = {}): VaultUploadDependencies {
  return {
    createSignature: vi.fn(async () => signature),
    uploadToCloudinary: vi.fn(async () => ({
      bytes: 10,
      etag: 'etag',
      public_id: 'astraos/user/ai-vault/folder_1/vault-public-id',
      resource_type: 'raw',
      secure_url: 'https://res.cloudinary.com/astra-cloud/raw/upload/vault-public-id',
    })),
    registerDocument: vi.fn(async (payload) => ({ _id: '507f1f77bcf86cd799439011', ...payload })),
    ...overrides,
  }
}

describe('vault upload flow', () => {
  it('builds the signed Cloudinary form payload', () => {
    const formData = buildCloudinaryUploadFormData(signature, file())

    expect(formData.get('api_key')).toBe('api-key')
    expect(formData.get('timestamp')).toBe(String(signature.timestamp))
    expect(formData.get('signature')).toBe('signed')
    expect(formData.get('folder')).toBe('astraos/user/ai-vault/folder_1')
    expect(formData.get('public_id')).toBe('vault-public-id')
    expect(formData.get('overwrite')).toBe('false')
    expect(formData.get('resource_type')).toBe('raw')
    expect(formData.get('unique_filename')).toBe('false')
    expect(formData.get('context')).toBe('owner_id=user|content_type=application/pdf|bytes=10')
  })

  it('uploads to Cloudinary and registers AI Vault metadata', async () => {
    const deps = dependencies()
    const result = await uploadVaultFile({ file: file(), folderId: 'folder_1' }, deps)

    expect(deps.createSignature).toHaveBeenCalledWith({
      bytes: 10,
      contentType: 'application/pdf',
      folderId: 'folder_1',
      idempotencyKey: expect.stringMatching(/^vault_/),
    })
    expect(deps.uploadToCloudinary).toHaveBeenCalledTimes(1)
    expect(deps.registerDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: 10,
        cloudinaryPublicId: 'astraos/user/ai-vault/folder_1/vault-public-id',
        cloudinaryResourceType: 'raw',
        contentType: 'application/pdf',
        originalFilename: 'brief.pdf',
        sourceType: 'upload',
        tags: ['folder:folder_1'],
        title: 'brief.pdf',
      }),
      expect.stringMatching(/^vault_/),
    )
    expect(result._id).toBe('507f1f77bcf86cd799439011')
  })

  it('rejects unsupported content types before requesting a signature', async () => {
    expect(() => validateVaultUploadFile(file('vector.svg', 'image/svg+xml'))).toThrow('not allowed')
  })

  it('rejects oversized files before requesting a signature', async () => {
    const oversized = new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'large.pdf', {
      type: 'application/pdf',
    })

    await expect(uploadVaultFile({ file: oversized, folderId: 'folder_1' }, dependencies())).rejects.toThrow('10 MB')
  })

  it('surfaces signature failures', async () => {
    const deps = dependencies({
      createSignature: vi.fn(async () => {
        throw new Error('signature failed')
      }),
    })

    await expect(uploadVaultFile({ file: file(), folderId: 'folder_1' }, deps)).rejects.toThrow('signature failed')
    expect(deps.uploadToCloudinary).not.toHaveBeenCalled()
  })

  it('surfaces Cloudinary failures before registration', async () => {
    const deps = dependencies({
      uploadToCloudinary: vi.fn(async () => {
        throw new Error('cloudinary failed')
      }),
    })

    await expect(uploadVaultFile({ file: file(), folderId: 'folder_1' }, deps)).rejects.toThrow('cloudinary failed')
    expect(deps.registerDocument).not.toHaveBeenCalled()
  })

  it('surfaces registration failures after upload', async () => {
    const deps = dependencies({
      registerDocument: vi.fn(async () => {
        throw new Error('registration failed')
      }),
    })

    await expect(uploadVaultFile({ file: file(), folderId: 'folder_1' }, deps)).rejects.toThrow('registration failed')
  })

  it('returns repair metadata when upload succeeds but registration fails', async () => {
    const deps = dependencies({
      registerDocument: vi.fn(async () => {
        throw new Error('registration failed')
      }),
    })

    const error = await uploadVaultFile({ file: file(), folderId: 'folder_1' }, deps).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(VaultUploadRegistrationError)
    expect(error).toMatchObject({
      recovery: {
        folderId: 'folder_1',
        documentPayload: expect.objectContaining({
          cloudinaryPublicId: 'astraos/user/ai-vault/folder_1/vault-public-id',
          originalFilename: 'brief.pdf',
        }),
        uploadedAsset: expect.objectContaining({
          cloudinaryPublicId: 'astraos/user/ai-vault/folder_1/vault-public-id',
          cloudinaryResourceType: 'raw',
        }),
      },
    })
  })
})
