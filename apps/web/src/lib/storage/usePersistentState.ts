import { useCallback, useEffect, useMemo, useState } from 'react'

type SetStateAction<T> = T | ((value: T) => T)

const persistenceErrors = new Map<string, string>()

function quarantineKey(key: string) {
  return `${key}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}`
}

function rememberPersistenceError(key: string, error: unknown) {
  persistenceErrors.set(key, error instanceof Error ? error.message : String(error))
}

function clearPersistenceError(key: string) {
  persistenceErrors.delete(key)
}

export function getPersistentStateError(key: string) {
  return persistenceErrors.get(key) ?? null
}

function readPersistedValue<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue
  const raw = window.localStorage.getItem(key)
  if (!raw) return initialValue
  try {
    clearPersistenceError(key)
    return JSON.parse(raw) as T
  } catch (error) {
    rememberPersistenceError(key, error)
    const backupKey = quarantineKey(key)
    try {
      window.localStorage.setItem(backupKey, raw)
      window.localStorage.removeItem(key)
    } catch (quarantineError) {
      rememberPersistenceError(key, quarantineError)
    }
    return initialValue
  }
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readPersistedValue(key, initialValue))

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      clearPersistenceError(key)
    } catch (error) {
      rememberPersistenceError(key, error)
    }
  }, [key, value])

  const setPersistentValue = useCallback((next: SetStateAction<T>) => {
    setValue((current) => (typeof next === 'function' ? (next as (value: T) => T)(current) : next))
  }, [])

  const reset = useCallback(() => setValue(initialValue), [initialValue])

  return useMemo(
    () => [value, setPersistentValue, reset] as const,
    [reset, setPersistentValue, value],
  )
}
