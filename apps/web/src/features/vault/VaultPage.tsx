import type { FormEvent } from 'react'
import { FilePlus2, FolderPlus, LockKeyhole, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextArea, TextInput } from '../../components/ui/Field'
import { StatCard } from '../../components/ui/StatCard'
import { formatShortDate } from '../../lib/date'
import { useVaultData } from './useVaultData'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function VaultPage() {
  const vault = useVaultData()
  const totalBytes = vault.files.reduce((total, file) => total + file.size, 0)
  const firstSection = vault.sections[0]
  const firstFolder = vault.folders[0]

  function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    vault.addSection({
      name: String(form.get('name') || ''),
      color: String(form.get('color') || '#64748b'),
    })
    event.currentTarget.reset()
  }

  function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    vault.addFolder({
      sectionId: String(form.get('sectionId') || firstSection?.id || ''),
      name: String(form.get('name') || ''),
    })
    event.currentTarget.reset()
  }

  async function submitFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const upload = form.get('upload')
    if (upload instanceof File && upload.size > 0) {
      await vault.uploadFile({
        folderId: String(form.get('folderId') || firstFolder?.id || ''),
        file: upload,
      })
      event.currentTarget.reset()
      return
    }

    vault.addVirtualFile({
      folderId: String(form.get('folderId') || firstFolder?.id || ''),
      name: String(form.get('name') || ''),
      size: Number(form.get('size') || 0),
      type: String(form.get('type') || ''),
    })
    event.currentTarget.reset()
  }

  function submitDiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    vault.addDiaryEntry({
      title: String(form.get('title') || ''),
      body: String(form.get('body') || ''),
    })
    event.currentTarget.reset()
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Vault</p>
        <h2>Organize private files, folders, and journal entries in one place.</h2>
        <p>
          Keep records tidy today, with cloud uploads held back until secure storage is connected.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Sections" value={vault.sections.length} sub="vault spaces" tone="cyan" />
        <StatCard label="Folders" value={vault.folders.length} sub="organized groups" tone="green" />
        <StatCard label="Files" value={vault.files.length} sub={formatSize(totalBytes)} tone="amber" />
        <StatCard label="Diary" value={vault.diaryEntries.length} sub="private entries" tone="violet" />
      </div>

      <div className="three-column">
        <Card title="Section" eyebrow="Workspace">
          <form className="stack" onSubmit={submitSection}>
            <Field label="Name">
              <TextInput name="name" placeholder="Research" required />
            </Field>
            <Field label="Color">
              <TextInput name="color" type="color" defaultValue="#0ea5e9" />
            </Field>
            <Button variant="primary" type="submit">
              <Plus size={16} /> Add section
            </Button>
          </form>
        </Card>

        <Card title="Folder" eyebrow="Nested">
          <form className="stack" onSubmit={submitFolder}>
            <Field label="Section">
              <SelectInput name="sectionId" defaultValue={firstSection?.id} disabled={!firstSection}>
                {vault.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {!firstSection && <p className="form-hint">Create a section before adding folders.</p>}
            <Field label="Folder name">
              <TextInput name="name" placeholder="Sprint notes" required />
            </Field>
            <Button variant="primary" type="submit" disabled={!firstSection}>
              <FolderPlus size={16} /> Add folder
            </Button>
          </form>
        </Card>

        <Card title="File Upload" eyebrow={vault.isCloudBacked ? 'Cloud-backed' : 'Local catalog'}>
          <form className="stack" onSubmit={submitFile}>
            <Field label="Folder">
              <SelectInput name="folderId" defaultValue={firstFolder?.id} disabled={!firstFolder}>
                {vault.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {!firstFolder && <p className="form-hint">Create a folder before adding file records.</p>}
            <Field label="Upload file" hint="PDF, Office, JSON, plain text, markdown, CSV, PNG, JPEG, WebP, or GIF up to 10 MB.">
              <TextInput name="upload" type="file" />
            </Field>
            <Field label="Name">
              <TextInput name="name" placeholder="brief.pdf" />
            </Field>
            <div className="form-grid">
              <Field label="Bytes">
                <TextInput name="size" type="number" min={0} defaultValue={2048} />
              </Field>
              <Field label="Type">
                <TextInput name="type" placeholder="application/pdf" />
              </Field>
            </div>
            <Button variant="primary" type="submit" disabled={!firstFolder || vault.isUploading}>
              <FilePlus2 size={16} /> {vault.isUploading ? 'Uploading...' : vault.isCloudBacked ? 'Upload file' : 'Add file'}
            </Button>
            {vault.uploadStatus && <p className="form-hint">{vault.uploadStatus}</p>}
          </form>
        </Card>
      </div>

      <div className="two-column">
        <Card
          title="Vault Files"
          eyebrow="Storage-ready"
          action={
            <span className="secure-chip">
              <LockKeyhole size={14} /> Private by default
            </span>
          }
        >
          {vault.files.length === 0 ? (
            <EmptyState title="No files modeled" body="Add a virtual file to validate the storage schema." />
          ) : (
            <div className="item-list">
              {vault.files.map((file) => (
                <article className="data-card" key={file.id}>
                  <div>
                    <h3>{file.name}</h3>
                    <p>{file.type}</p>
                    <span>{formatSize(file.size)}</span>
                  </div>
                  <Button variant="ghost" onClick={() => vault.removeFile(file.id)} aria-label={`Delete ${file.name}`}>
                    <Trash2 size={16} />
                  </Button>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card title="Diary" eyebrow="Private journal">
          <form className="stack" onSubmit={submitDiary}>
            <Field label="Title">
              <TextInput name="title" placeholder="What changed today?" />
            </Field>
            <Field label="Entry">
              <TextArea name="body" rows={5} placeholder="Capture decisions, blockers, and lessons." />
            </Field>
            <Button variant="primary" type="submit">
              <Plus size={16} /> Save entry
            </Button>
          </form>
          <div className="item-list compact">
            {vault.diaryEntries.map((entry) => (
              <article className="data-row" key={entry.id}>
                <span>
                  {entry.title} · {formatShortDate(entry.date)}
                </span>
                <Button
                  aria-label={`Delete diary entry ${entry.title}`}
                  variant="ghost"
                  onClick={() => vault.removeDiaryEntry(entry.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
