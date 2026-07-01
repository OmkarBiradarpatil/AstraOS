import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({
  children,
  className = '',
  type = 'button',
  variant = 'secondary',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`btn ${variant} ${className}`.trim()} type={type} {...props}>
      {children}
    </button>
  )
}
