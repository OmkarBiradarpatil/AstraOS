import mongoose, { Schema } from 'mongoose'

const healthLogSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: ['water', 'sleep', 'workout', 'screen', 'checkin', 'custom'],
      required: true,
      index: true,
    },
    date: { type: String, required: true, trim: true, index: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

healthLogSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
healthLogSchema.index({ ownerId: 1, type: 1, date: -1 })

export const HealthLogModel = (mongoose.models.HealthLog ?? mongoose.model('HealthLog', healthLogSchema)) as mongoose.Model<any>
