import mongoose, { Schema } from 'mongoose'

const settingsSchema = new Schema(
  {
    ownerId: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, default: null, index: true },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
    profile: { type: Schema.Types.Mixed, default: {} },
    preferences: { type: Schema.Types.Mixed, default: {} },
    flags: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: true },
)

export const SettingsModel = (mongoose.models.Settings ?? mongoose.model('Settings', settingsSchema)) as mongoose.Model<any>
