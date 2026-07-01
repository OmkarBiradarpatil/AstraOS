import mongoose, { Schema } from 'mongoose'
import { roles } from '../utils/roles.js'

const userSchema = new Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 320 },
    name: { type: String, default: '', trim: true, maxlength: 160 },
    role: { type: String, enum: roles, default: 'student', index: true },
    orgId: { type: String, default: null, index: true },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, strict: true },
)

userSchema.index({ email: 1 })

export const UserModel = (mongoose.models.User ?? mongoose.model('User', userSchema)) as mongoose.Model<any>
