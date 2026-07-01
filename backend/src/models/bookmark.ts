import mongoose, { Schema } from 'mongoose'

const bookmarkSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, default: 'Reference', trim: true, maxlength: 80, index: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

bookmarkSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
bookmarkSchema.index({ ownerId: 1, category: 1, createdAt: -1 })
bookmarkSchema.index({ ownerId: 1, title: 'text', description: 'text', url: 'text' })

export const BookmarkModel = (mongoose.models.Bookmark ?? mongoose.model('Bookmark', bookmarkSchema)) as mongoose.Model<any>
