import mongoose, { Schema } from 'mongoose'

const aiVaultChunkSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    documentId: { type: Schema.Types.ObjectId, required: true, ref: 'AiVaultDocument', index: true },
    index: { type: Number, required: true, min: 0 },
    content: { type: String, required: true, maxlength: 8000 },
    charCount: { type: Number, required: true, min: 1 },
  },
  { timestamps: true, strict: true },
)

aiVaultChunkSchema.index({ ownerId: 1, documentId: 1, index: 1 }, { unique: true })

export const AiVaultChunkModel =
  (mongoose.models.AiVaultChunk ?? mongoose.model('AiVaultChunk', aiVaultChunkSchema)) as mongoose.Model<any>
