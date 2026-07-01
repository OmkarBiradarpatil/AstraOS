import type { FormEvent } from 'react'
import { Bot, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, TextArea } from '../../components/ui/Field'
import { StatCard } from '../../components/ui/StatCard'
import { useCloudReadiness } from '../auth/cloudReadiness'
import { useAssistant } from './useAssistant'

export function AssistantPage() {
  const assistant = useAssistant()
  const cloud = useCloudReadiness()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    assistant.sendMessage(String(form.get('message') || ''))
    event.currentTarget.reset()
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">AYNTK Assistant</p>
        <h2>Ask for planning help, security notes, or a quick workspace summary.</h2>
        <p>
          The local assistant keeps momentum while cloud intelligence remains optional and controlled.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Messages" value={assistant.messages.length} sub={cloud.ready ? 'synced requests' : 'local thread'} tone="cyan" />
        <StatCard label="Mode" value={cloud.label} sub={cloud.ready ? 'connected' : cloud.detail} tone={cloud.tone} />
        <StatCard label="Focus" value="Secure" sub="plain text output" tone="amber" />
        <StatCard label="Scope" value="Workspace" sub="planning support" tone="violet" />
      </div>

      <Card
        title="Assistant Console"
        eyebrow="Workspace chat"
        action={
          <Button variant="ghost" onClick={assistant.clearMessages}>
            <Trash2 size={16} /> Clear
          </Button>
        }
      >
        <div className="assistant-console">
          <div className="message-list">
            {assistant.messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span className="message-avatar">
                  {message.role === 'assistant' ? <Bot size={16} /> : <Sparkles size={16} />}
                </span>
                <div>
                  <strong>{message.role === 'assistant' ? 'AYNTK' : 'You'}</strong>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>

          <form className="assistant-form" onSubmit={submit}>
            <Field label="Message">
              <TextArea name="message" rows={4} placeholder="Ask about backend gaps, tasks, or security..." />
            </Field>
            <Button variant="primary" type="submit">
              <Send size={16} /> Send
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
