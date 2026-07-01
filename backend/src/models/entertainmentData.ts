import mongoose, { Schema } from 'mongoose'

const entertainmentDataSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: ['anime', 'bucket', 'watchtime', 'challenge', 'game', 'preference'],
      required: true,
      index: true,
    },
    data: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

entertainmentDataSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
entertainmentDataSchema.index({ ownerId: 1, type: 1, updatedAt: -1 })

export const EntertainmentDataModel =
  (mongoose.models.EntertainmentData ?? mongoose.model('EntertainmentData', entertainmentDataSchema)) as mongoose.Model<any>
