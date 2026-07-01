import { useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowRight } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Field'
import { useAuth } from './useAuth'

export function LoginPage() {
  const { signIn, signUp, source, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'student' | 'parent' | 'teacher' | 'admin'>('student')
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const isLocalAuth = source === 'local'

  if (user) return <Navigate to={redirectTo} replace />

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (source === 'clerk') {
      signIn()
      return
    }
    signIn({ name, email, role })
    navigate(redirectTo, { replace: true })
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="brand-mark">
          <Activity size={24} />
        </div>
        <p className="eyebrow">AstraOS Enterprise Rebuild</p>
        <h1>Enter the workspace</h1>
        <p className="lede">
          {source === 'clerk'
            ? 'Authentication is connected through Clerk as the production identity provider.'
            : 'Authentication is running in local bridge mode until Clerk Auth is configured.'}
        </p>

        <form className="stack" onSubmit={submit}>
          <Field label="Display name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} required={isLocalAuth} />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required={isLocalAuth}
            />
          </Field>
          <Field label="Role">
            <SelectInput
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
            >
              <option value="student">Student</option>
              <option value="parent">Parent</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </SelectInput>
          </Field>
          <Button variant="primary" type="submit">
            Continue <ArrowRight size={16} />
          </Button>
          {source === 'clerk' && (
            <Button variant="secondary" type="button" onClick={() => signUp()}>
              Create account
            </Button>
          )}
        </form>
      </section>
    </main>
  )
}
