import mongoose, { Schema } from 'mongoose'

const aiVaultDocumentSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    sourceType: { type: String, enum: ['upload', 'note', 'url'], required: true },
    cloudinaryPublicId: { type: String, default: null, index: true },
    cloudinaryResourceType: { type: String, enum: ['image', 'video', 'raw', 'auto', null], default: null },
    originalFilename: { type: String, default: '', trim: true, maxlength: 240 },
    contentType: { type: String, default: '', trim: true, maxlength: 160 },
    bytes: { type: Number, default: 0, min: 0 },
    contentHash: { type: String, required: true, index: true },
    status: { type: String, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued', index: true },
    tags: { type: [String], default: [], index: true },
    summary: { type: String, default: '', maxlength: 12000 },
    chunkCount: { type: Number, default: 0, min: 0 },
    extractedTextHash: { type: String, default: '', index: true },
    extractedAt: { type: Date, default: null },
    errorMessage: { type: String, default: '', maxlength: 1000 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

aiVaultDocumentSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
aiVaultDocumentSchema.index({ ownerId: 1, createdAt: -1 })
aiVaultDocumentSchema.index(
  { ownerId: 1, contentHash: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
)
aiVaultDocumentSchema.index({ ownerId: 1, title: 'text', summary: 'text' })

export const AiVaultDocumentModel =
  (mongoose.models.AiVaultDocument ?? mongoose.model('AiVaultDocument', aiVaultDocumentSchema)) as mongoose.Model<any>
