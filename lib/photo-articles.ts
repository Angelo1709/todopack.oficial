// Vista compartida del portal: un artículo con sus presentaciones y fotos alternativas.
import { parsePresentation, presentationLabel } from "./pack.ts"
import type { PhotoProduct, PhotoCandidate, PhotoSnapshot } from "./photo-review-store.ts"

export const photoArticleKey = (p: PhotoProduct) => p.groupKey ?? `id:${p.id}`
export function photoArticles(data: PhotoSnapshot) {
  const groups = new Map<string, PhotoProduct[]>()
  for (const product of data.products) {
    const key = photoArticleKey(product)
    groups.set(key, [...(groups.get(key) ?? []), product])
  }
  return [...groups].map(([key, rows]) => {
    const products = [...rows].sort((a,b) => a.packSize-b.packSize || a.id-b.id)
    const base = products[0]
    const parsed = parsePresentation(base.name)
    const display = products.map(p=>parsePresentation(p.name)).find(p=>p.groupKey===key) ?? parsed
    const ids = new Set(products.map(p=>p.id))
    const candidates = data.candidates.filter(c=>ids.has(c.productId ?? 0))
    // La misma imagen importada para unidad y pack se revisa una sola vez.
    // Se conserva la decisión más reciente/pública; las otras filas siguen en el historial.
    const unique = new Map<string, PhotoCandidate>()
    for (const c of candidates) {
      const previous = unique.get(c.sha256)
      const score = (x: PhotoCandidate) => (x.published ? 100000 : 0)+x.version
      if (!previous || score(c)>score(previous)) unique.set(c.sha256,c)
    }
    return { key, id:base.id, name:parsed.packSize===base.packSize?display.baseName:base.name,
      products, imageUrl:products.find(p=>p.imageUrl)?.imageUrl ?? null,
      presentations:[...new Set(products.map(p=>presentationLabel(p.name,p.packSize)))].join(" · "),
      candidates:[...unique.values()] }
  }).sort((a,b)=>a.name.localeCompare(b.name,"es"))
}
