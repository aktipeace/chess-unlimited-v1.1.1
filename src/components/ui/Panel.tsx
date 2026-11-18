import type { ComponentPropsWithoutRef } from 'react'

/** Card surface. Extra attributes (for example `aria-labelledby`) go straight to the <section>. */
export function Panel({ children, className = '', ...rest }: ComponentPropsWithoutRef<'section'>) {
  return <section className={`panel ${className}`.trim()} {...rest}>{children}</section>
}
