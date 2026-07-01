import mongoose, { Schema } from 'mongoose'

const taskSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    notes: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: ['todo', 'doing', 'done'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
    tags: { type: [String], default: [], index: true },
    estimateMinutes: { type: Number, default: 25, min: 5, max: 720 },
    dueDate: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
)

taskSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })
taskSchema.index({ ownerId: 1, status: 1, dueDate: 1 })
taskSchema.index({ ownerId: 1, priority: 1, status: 1 })

export const TaskModel = mongoose.models.Task ?? mongoose.model('Task', taskSchema)
