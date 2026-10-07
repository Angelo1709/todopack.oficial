import pg from "pg"
import { readFileSync,writeFileSync } from "node:fs"
import { planPresentationRepairs } from "../lib/presentation-audit.ts"
import { parsePresentation } from "../lib/pack.ts"

const arg = name => { const i=process.argv.indexOf(name);return i<0 ? null : process.argv[i+1] }
const snapshot=arg("--snapshot")
const output=arg("--output")
if (!output) throw new Error("Indicá --output para guardar la auditoría")
let products
if (snapshot) products=JSON.parse(readFileSync(snapshot,"utf8")).allProducts
else {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL})
  try { products=(await pool.query("SELECT id,name,price,pack_size,group_key,image_url,active FROM products ORDER BY id")).rows }
  finally { await pool.end() }
}
const repairs=planPresentationRepairs(products)
const retailCounts=products.filter(r=>r.active && r.pack_size===1 && parsePresentation(r.name).packSize===1
  && /\bX\s*\d+(?:U|UNIDADES|BOTELLAS)?(?:\s|$)/i.test(r.name)).map(r=>({id:r.id,name:r.name,reason:"Contenido del envase o presentación sin evidencia de unidad equivalente; se conserva"}))
const report={at:new Date().toISOString(),products:products.length,repairs,retailCounts,allProducts:products}
writeFileSync(output,JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({products:products.length,repairs:repairs.length,quantityCorrections:repairs.filter(r=>r.packSize!==r.fromSize).length,retailCounts:retailCounts.length}))
