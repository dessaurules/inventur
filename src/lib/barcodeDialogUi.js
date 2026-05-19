import { cn } from './cn.js'
import {
  authAlertMuted,
  authButtonOutline,
  authButtonPrimary,
  authCardDescription,
  authCardTitle,
  authFieldGroup,
  authInlineCode,
  authInputClass,
  authLabelClass,
} from './authUi.js'

export const barcodeDialogOverlay = 'fixed inset-0 z-[1300] bg-black/80'

export const barcodeDialogContent = cn(
  'fixed left-1/2 top-[50%] z-[1300] flex w-[min(100%,28rem)] max-h-[min(calc(100dvh-2rem),40rem)] -translate-x-1/2 -translate-y-1/2',
  'flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg',
  'focus:outline-none'
)

export const barcodeDialogHeader = 'flex flex-col gap-1.5 text-left pr-8'

export const barcodeDialogTitle = cn(authCardTitle, 'text-lg')

export const barcodeDialogDescription = authCardDescription

export const barcodeDialogCloseBtn = cn(
  'absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md',
  'text-muted-foreground transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-50'
)

export const barcodeCameraWrap =
  'relative w-full overflow-hidden rounded-lg border border-border bg-muted aspect-[3/4] max-h-[min(52dvh,420px)]'

export const barcodeCameraVideo = 'absolute inset-0 h-full w-full object-cover object-center bg-black'

export const barcodeCameraOverlay =
  'absolute inset-0 flex items-center justify-center bg-foreground/40 px-4 text-center text-xs text-background'

export const barcodeStatusText = 'text-xs text-muted-foreground'

export const barcodeAlert = authAlertMuted

export const barcodeFooter = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2'

export const barcodeButtonOutline = cn(authButtonOutline, 'w-full sm:w-auto min-h-10')

export const barcodeButtonPrimary = cn(authButtonPrimary, 'w-full sm:w-auto min-h-10')

/** Tabs: Container wächst mit Touch-Höhe der Trigger (kein festes h-9). */
export const barcodeTabsList =
  'grid w-full grid-cols-2 items-stretch gap-1 rounded-lg bg-muted p-1 text-muted-foreground'

/** Tabs ohne Hover (Touch). */
export function barcodeTabsTriggerCn(selected) {
  return cn(
    'inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
  )
}

export const barcodeFieldGroup = authFieldGroup
export const barcodeLabel = authLabelClass
export const barcodeInput = authInputClass
export const barcodeInlineCode = authInlineCode

export const barcodeCreateGrid = 'grid grid-cols-1 gap-3 sm:grid-cols-3'

export const barcodeLinkList =
  'max-h-[min(40vh,14rem)] overflow-y-auto rounded-md border border-border bg-background'

export const barcodeLinkEmpty = 'px-3 py-4 text-center text-sm text-muted-foreground'

export function barcodeLinkItemCn(selected) {
  return cn(
    'flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
    'min-h-11',
    selected ? 'bg-muted' : 'bg-background'
  )
}

export const barcodeLinkItemTitle = 'font-medium text-foreground'

export const barcodeLinkItemMeta = 'text-xs text-muted-foreground'

export const barcodeLinkPreview = 'text-sm text-muted-foreground'

export const barcodeSectionActions = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
