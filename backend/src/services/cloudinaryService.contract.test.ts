import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import {
  createUploadSignature,
  deleteUserCloudinaryAsset,
  getUserCloudinaryAssetMetadata,
  listUserCloudinaryAssets,
} from './cloudinaryService.js'

vi.mock('cloudinary', () => ({
  v2: {
    api: {
      resource: vi.fn(async () => ({ bytes: 1000 })),
      resources: vi.fn(async () => ({ resources: [] })),
    },
    config: vi.fn(),
    uploader: {
      destroy: vi.fn(async () => ({ result: 'ok' })),
    },
    utils: {
      api_sign_request: vi.fn(() => 'signed-request'),
    },
  },
}))

describe('cloudinary service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-secret'
  })

  it('returns exact owner-isolated signed upload params', () => {
    const signature = createUploadSignature({
      bytes: 1000,
      contentType: 'application/pdf',
      folder: 'ai-vault/default',
      resourceType: 'raw',
    }, 'user_a')

    expect(cloudinary.utils.api_sign_request).toHaveBeenCalledWith(expect.objectContaining({
      context: 'owner_id=user_a|content_type=application/pdf|bytes=1000',
      folder: 'astraos/user_a/ai-vault/default',
      overwrite: 'false',
      public_id: expect.stringMatching(/^vault-/),
      resource_type: 'raw',
      timestamp: expect.any(Number),
      unique_filename: 'false',
    }), 'astra-secret')
    expect(signature.uploadParams).toMatchObject({
      context: 'owner_id=user_a|content_type=application/pdf|bytes=1000',
      folder: 'astraos/user_a/ai-vault/default',
      overwrite: 'false',
      resource_type: 'raw',
      signature: 'signed-request',
      unique_filename: 'false',
    })
  })

  it('rejects asset metadata reads outside the authenticated user vault prefix', async () => {
    await expect(getUserCloudinaryAssetMetadata('user_a', 'astraos/user_b/ai-vault/file', 'raw'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ASSET', status: 403 })
    expect(cloudinary.api.resource).not.toHaveBeenCalled()
  })

  it('rejects unsafe storage folders before provider list calls', async () => {
    await expect(listUserCloudinaryAssets('user_a', 'ai-vault/../other'))
      .rejects.toMatchObject({ code: 'INVALID_STORAGE_FOLDER', status: 400 })
    expect(cloudinary.api.resources).not.toHaveBeenCalled()
  })

  it('rejects asset deletion outside the authenticated user vault prefix', async () => {
    await expect(deleteUserCloudinaryAsset('user_a', 'astraos/user_b/ai-vault/file', 'raw'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ASSET', status: 403 })
    await expect(deleteUserCloudinaryAsset('user_a', 'astraos/user_a/profile/avatar', 'raw'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ASSET', status: 403 })
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })
})
