import { cn } from './cn.js'

/** Außenfläche (Login-Seite) — shadcn Blocks: dezentes Muted */
export const authPageShell = 'flex min-h-dvh flex-col items-center justify-center bg-muted/40 p-4 sm:p-8'

/** Card — analog shadcn/ui Card */
export const authCardClass =
  'w-full max-w-[26rem] rounded-xl border border-border bg-card text-card-foreground shadow-sm'

/** Card inner: ein Block mit einheitlichem Abstand */
export const authCardSection = 'flex flex-col gap-6 p-6'

/** CardTitle */
export const authCardTitle =
  'text-2xl font-semibold leading-none tracking-tight text-card-foreground'

/** CardDescription */
export const authCardDescription = 'text-sm text-muted-foreground'

/** TabsList — shadcn Tabs */
export const authTabsListClass =
  'grid h-9 w-full grid-cols-2 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground'

/** TabsTrigger — data-[state=active] per aria-selected abbilden */
export function authTabsTriggerCn(selected) {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    selected
      ? 'bg-background text-foreground shadow'
      : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
  )
}

/** Formular-Zeilenabstand zwischen Feldern */
export const authFormClass = 'flex flex-col gap-4'

/** Feldgruppe Label + Control */
export const authFieldGroup = 'flex flex-col gap-2'

/** Label — wie shadcn Label */
export const authLabelClass = 'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70'

/**
 * Input — shadcn/ui Input (h-9, Fokus-Ring wie im Generator)
 */
export const authInputClass = cn(
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors md:text-sm',
  'placeholder:text-muted-foreground',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'disabled:cursor-not-allowed disabled:opacity-50'
)

/** OTP / numerisch etwas höher wirken — gleiche Kanten wie Input */
export const authOtpInputClass = cn(
  authInputClass,
  'h-11 text-center text-lg tabular-nums tracking-[0.35em]'
)

/** Primär-Button — shadcn Button default */
export const authButtonPrimary = cn(
  'inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2',
  'text-sm font-medium text-primary-foreground shadow-sm',
  'transition-colors hover:bg-primary/90',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/55',
  'disabled:pointer-events-none disabled:opacity-50'
)

/** Link-Buttons — Variante „link“ */
export const authButtonLink = cn(
  'inline-flex justify-center whitespace-nowrap text-sm font-medium text-primary underline-offset-4 hover:underline',
  'rounded-md px-2 py-1.5',
  'transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-50'
)

/** Zurück-Link — ohne Primary-Farbton */
export const authMutedLink = cn(
  'inline-flex justify-center whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-normal text-muted-foreground underline-offset-4',
  'transition-colors hover:text-foreground hover:underline',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-50'
)

/** Inline-Code wie shadcn <code> auf Muted-Fläche */
export const authInlineCode =
  'relative rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-foreground'

/** Outline-Button — shadcn Button outline */
export const authButtonOutline = cn(
  'inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2',
  'text-sm font-medium text-foreground shadow-sm',
  'transition-colors hover:bg-accent hover:text-accent-foreground',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/55',
  'disabled:pointer-events-none disabled:opacity-50'
)

/** Alert destructive — shadcn Alert (variant destructive) */
export const authAlertDestructive =
  'relative w-full rounded-lg border border-destructive/50 bg-background px-4 py-3 text-sm text-destructive'

/** Hinweis / Neutral — ohne semantisches Grün — im Stil eines Default-Alerts */
export const authAlertMuted =
  'w-full rounded-lg border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-foreground'