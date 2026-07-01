type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function write(level: LogLevel, message: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...metadata,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => write('debug', message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => write('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => write('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => write('error', message, metadata),
}
