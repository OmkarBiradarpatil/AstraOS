import mongoose, { Schema } from 'mongoose'

const deadlineSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    category: { type: String, default: 'General', trim: true, maxlength: 80, index: true },
    dueDate: { type: Date, required: true, index: true },
    dueTime: { type: String, default: '23:59', trim: true, maxlength: 8 },
    reminderEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 320 },
    remindBefore: {
      type: String,
      enum: ['1h', '3h', '6h', '12h', '1d', '2d', '3d'],
      default: '1d',
    },
    remindAt: { type: Date, default: null, index: true },
    reminderStatus: {
      type: String,
      enum: ['none', 'scheduled', 'sent', 'failed'],
      default: 'none',
      index: true,
    },
    reminderLastAttemptAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    reminderFailureReason: { type: String, default: '', trim: true, maxlength: 500 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

deadlineSchema.pre('validate', function scheduleReminderStatus() {
  const hasReminder = Boolean(this.reminderEmail && this.remindAt)
  if (hasReminder && this.reminderStatus === 'none') this.reminderStatus = 'scheduled'
  if (!hasReminder) {
    this.reminderStatus = 'none'
    this.reminderLastAttemptAt = null
    this.reminderSentAt = null
    this.reminderFailureReason = ''
  }
})

deadlineSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
deadlineSchema.index({ ownerId: 1, dueDate: 1 })
deadlineSchema.index({ ownerId: 1, reminderStatus: 1, remindAt: 1 })

export const DeadlineModel = (mongoose.models.Deadline ?? mongoose.model('Deadline', deadlineSchema)) as mongoose.Model<any>
