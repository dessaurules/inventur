import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Mutationen für Artikel-Updates mit optionalem Cache-Key (für spätere Erweiterung).
 * @param {object} opts
 * @param {(args: object) => Promise<{ ok: boolean, message?: string }>} opts.updateArtikel
 */
export function useArticlePatchMutation({ updateArtikel }) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['magazin-artikel-patch'],
    mutationFn: async (args) => {
      const res = await updateArtikel(args)
      if (!res?.ok) {
        throw new Error(res?.message || 'Speichern fehlgeschlagen.')
      }
      return res
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['magazin-artikel-patch'] })
    },
  })
}
