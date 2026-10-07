import { normalizeGroupKey, parsePresentation } from "./pack.ts"

type Row = { id: number; name: string; price: number; pack_size: number; group_key: string | null; active: boolean }
export type PresentationRepair = { id: number; name: string; fromSize: number; packSize: number; fromKey: string | null; groupKey: string; reason: string }

/** La auditoría usa identidades exactas, con sabor y medida; conserva grupos manuales. */
export function planPresentationRepairs(rows: Row[]): PresentationRepair[] {
  const active = rows.filter(r => r.active)
  const result = new Map<number, PresentationRepair>()
  const parsed = new Map(active.map(r => [r.id, parsePresentation(r.name)]))
  const effective = active.map(r => {
    const p = parsed.get(r.id)!
    // Sólo completa cantidades que quedaron como unidad; no pisa tamaños corregidos.
    if (r.pack_size === 1 && p.packSize > 1) {
      const units = active.filter(u => u.id !== r.id && u.pack_size === 1
        && parsed.get(u.id)!.packSize === 1 && parsed.get(u.id)!.groupKey === p.groupKey)
      const unitKeys = new Set(units.map(u => u.group_key).filter(Boolean))
      const manualKey = r.group_key && r.group_key !== normalizeGroupKey(r.name)
        && r.group_key !== p.groupKey ? r.group_key : null
      const groupKey = manualKey ?? (unitKeys.size === 1 ? [...unitKeys][0]! : p.groupKey)
      result.set(r.id, { id:r.id, name:r.name, fromSize:r.pack_size, packSize:p.packSize,
        fromKey:r.group_key, groupKey, reason:"Cantidad de presentación indicada en el nombre" })
      return { ...r, pack_size:p.packSize, group_key:groupKey }
    }
    return { ...r }
  })
  // FRÍA puede ser la única unidad del artículo. Si existe una unidad regular,
  // conserva las dos variantes y sus precios por separado.
  const groups = new Map<string, Row[]>()
  for (const r of effective) if (r.group_key) groups.set(r.group_key,[...(groups.get(r.group_key) ?? []),r])
  const comparable = (key:string) => key.replace(/(^| )cerveza(?= |$)/g,"$1").replace(/\s+/g," ").trim()
  // "CORONA CERVEZA 710ML" y "CORONA 710ML" conservan la misma medida
  // y marca. FRÍA sigue siendo parte de la identidad en esta primera pasada.
  for (const [key, packs] of [...groups]) {
    if (packs.some(r => r.pack_size === 1)) continue
    const targets = [...groups].filter(([other, unitRows]) => other !== key
      && comparable(other) === comparable(key) && unitRows.some(r => r.pack_size === 1))
    if (targets.length !== 1) continue
    const [targetKey,targetRows] = targets[0]
    for (const r of packs) {
      const prior = result.get(r.id)
      result.set(r.id,{id:r.id,name:r.name,fromSize:prior?.fromSize ?? r.pack_size,
        packSize:r.pack_size,fromKey:prior?.fromKey ?? r.group_key,groupKey:targetKey,
        reason:"Misma marca y medida; CERVEZA es una descripción de la bebida"})
      r.group_key = targetKey
    }
    groups.set(targetKey,[...targetRows,...packs]); groups.delete(key)
  }
  for (const [key, cold] of groups) {
    if (!/(^| )fria( |$)/.test(key)) continue
    const regularKey = key.replace(/(^| )fria(?= |$)/g,"$1").replace(/\s+/g," ").trim()
    const regular = groups.get(regularKey)
    const hasRegularUnit = effective.some(r => r.pack_size === 1 && r.group_key
      && comparable(r.group_key) === comparable(regularKey))
    if (!regular?.length || hasRegularUnit
      || cold.some(r => r.pack_size !== 1) || new Set(cold.map(r => r.price)).size !== 1) continue
    for (const r of cold) {
      const prior = result.get(r.id)
      result.set(r.id,{ id:r.id,name:r.name,fromSize:prior?.fromSize ?? r.pack_size,
        packSize:r.pack_size,fromKey:prior?.fromKey ?? r.group_key,groupKey:regularKey,
        reason:"FRÍA es la única presentación unitaria; el grupo regular sólo tiene packs" })
    }
  }
  return [...result.values()].sort((a,b) => a.id-b.id)
}
