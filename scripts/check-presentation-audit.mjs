import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { planPresentationRepairs } from "../lib/presentation-audit.ts"
import migrate from "../lib/db/migrations/0011_presentaciones_sin_pack.mjs"
import { priceFor, describeBreakdown } from "../lib/pricing.ts"
import { parsePresentation } from "../lib/pack.ts"

const db = new PGlite()
const client = { query: (sql,args) => db.query(sql,args) }
try {
  await db.exec(`CREATE TABLE "user" (id text PRIMARY KEY);
    CREATE TABLE products(id integer PRIMARY KEY,name text,price integer,pack_size integer,
      group_key text,image_url text,active boolean,updated_at timestamptz DEFAULT now());`)
  await db.exec(readFileSync(new URL("../lib/db/migrations/0009_portal_fotos.sql",import.meta.url),"utf8"))
  const cases = [
    [2,"9 DE ORO AGRIDULCE 200G",1200,1,"9 de oro agridulce 200g","https://test.test/9oro.jpg"],
    [692,"9 DE ORO AGRIDULCE 200GR X20 UNIDADES",22000,1,"9 de oro agridulce 200g x20 unidades",null],
    [3,"9 DE ORO AZUCARADAS 210G UNIDAD",1200,1,"9 de oro azucaradas 210g",null],
    [693,"9 DE ORO AZUCARADAS 210G CAJAX28",30800,1,"9 de oro azucaradas 210g cajax28",null],
    [10,"PEPSI 1.5L PACK X6",15000,6,"pepsi 1.5l",null],
    [11,"PEPSI 1.5L FRIA UNIDAD",2700,1,"pepsi fria 1.5l",null],
    [20,"CORONA 710ML X12",30000,12,"corona 710ml",null],
    [21,"CORONA CERVEZA 710ML UNIDAD",4800,1,"corona cerveza 710ml",null],
    [22,"CORONA 710ML UNIDAD FRIA",5000,1,"corona fria 710ml",null],
    [30,"LA VIRGINIA CAFE SAQUITO X20",4700,1,"la virginia cafe saquito x20",null],
    [31,"TRAVIATA ORIGINAL 108GR X3 TRIPACK",1800,1,"traviata original 108g x3 tripack",null],
    [32,"PRODUCTO 200G X20",10000,12,"grupo corregido manualmente",null],
    [33,"PRODUCTO 200G X20",10000,1,"grupo manual conservado",null],
  ]
  for (const r of cases) await db.query("INSERT INTO products(id,name,price,pack_size,group_key,image_url,active) VALUES($1,$2,$3,$4,$5,$6,true)",r)
  const before=(await db.query("SELECT * FROM products ORDER BY id")).rows
  await migrate(client)
  const after=(await db.query("SELECT * FROM products ORDER BY id")).rows
  const byId=new Map(after.map(r=>[r.id,r]))
  assert.equal(byId.get(692).pack_size,20)
  assert.equal(byId.get(692).group_key,byId.get(2).group_key)
  assert.equal(byId.get(692).image_url,byId.get(2).image_url)
  assert.equal(byId.get(693).pack_size,28)
  assert.equal(byId.get(693).group_key,byId.get(3).group_key)
  assert.equal(byId.get(11).group_key,byId.get(10).group_key)
  assert.equal(byId.get(20).group_key,byId.get(21).group_key)
  assert.notEqual(byId.get(22).group_key,byId.get(20).group_key,"Una tercera unidad regular conserva el precio FRÍA separado")
  assert.equal(byId.get(30).pack_size,1)
  assert.equal(byId.get(31).pack_size,1)
  assert.equal(byId.get(32).pack_size,12)
  assert.equal(byId.get(33).group_key,"grupo manual conservado")
  assert.deepEqual(before.map(r=>[r.id,r.name,r.price,r.active]),after.map(r=>[r.id,r.name,r.price,r.active]))
  const tiers=[2,692].map(id=>{const r=byId.get(id);return{productId:id,name:r.name,price:r.price,packSize:r.pack_size,label:parsePresentation(r.name).label}})
  for (const [n,total] of [[19,22800],[20,22000],[21,23200],[39,44800],[40,44000]]) assert.equal(priceFor(tiers,n).total,total)
  assert.equal(describeBreakdown(priceFor(tiers,21)),"1 pack x20 + 1 u.")
  assert.equal(planPresentationRepairs(after).length,0,"La migración es idempotente")
  console.log("OK: presentaciones x20/x28, precio mixto, foto única, FRÍA con/sin tercera unidad, grupos manuales y envases minoristas.")
} finally { await db.close() }
