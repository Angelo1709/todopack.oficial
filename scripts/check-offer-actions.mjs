import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { priceFor } from "../lib/pricing.ts"
const memory = new PGlite()
await memory.exec(readFileSync(new URL("../lib/db/migrations/0001_init.sql", import.meta.url), "utf8"))
await memory.exec(readFileSync(new URL("../lib/db/migrations/0013_stock_gestion.sql", import.meta.url), "utf8"))
await memory.exec(readFileSync(new URL("../lib/db/migrations/0015_ofertas.sql", import.meta.url), "utf8"))
await memory.exec("INSERT INTO products(id,name,price,pack_size,group_key) VALUES(1,'GALLETITAS UNIDAD',1000,1,'galletitas'),(2,'GALLETITAS PACK X6',4800,6,'galletitas'); UPDATE products SET image_url='/test.png'")
const state = globalThis.__offerActionQA = { admin: false, db: drizzle(memory), paths: [] }
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`
const mocks = {
 "@/lib/db":stub("export const db=globalThis.__offerActionQA.db; export const pool={query:async()=>({rows:[]})}"),
 "@/lib/session":stub("export async function requireAdmin(){if(!globalThis.__offerActionQA.admin)throw Error('Forbidden')}"),
 "@/lib/stock":stub("export const stockEnabled=()=>false;export async function loadProductStock(){return new Map()}"),
 "next/cache":stub("export function revalidatePath(path){globalThis.__offerActionQA.paths.push(path)}"),
 "server-only":stub(""),
}
const root=new URL("../",import.meta.url)
const hooks=registerHooks({resolve(specifier,context,next){
 if(mocks[specifier])return {url:mocks[specifier],shortCircuit:true}
 if(specifier.startsWith("@/"))return {url:new URL(specifier.slice(2)+".ts",root).href,shortCircuit:true}
 return next(specifier,context)
}})
try {
 const {saveOffer,toggleOffer,listOffers,searchOfferProducts}=await import("../app/actions/offers.ts")
 const {loadArticlesForProducts}=await import("../lib/catalog.ts")
 const offer={title:"Promo",kind:"bundle",percent:20,buy:2,pay:1,active:true}
 await assert.rejects(()=>saveOffer([1],offer),/Forbidden/)
 await assert.rejects(()=>toggleOffer(1,false),/Forbidden/)
 await assert.rejects(()=>listOffers(),/Forbidden/)
 state.admin=true
 for (const invalid of [{...offer,percent:100},{...offer,pay:2},{...offer,buy:1},{...offer,title:""}]) assert.equal((await saveOffer([1],invalid)).ok,false)
 assert.equal((await saveOffer([],offer)).ok,false)
 assert.equal((await saveOffer([1],offer)).ok,true)
 let articles=await loadArticlesForProducts([1]);assert.equal(priceFor(articles.get(1).tiers,3).total,2000)
 assert.equal((await listOffers()).length,1)
 assert.equal((await toggleOffer(1,false)).ok,true)
 articles=await loadArticlesForProducts([1]);assert.equal(priceFor(articles.get(1).tiers,3).total,3000)
 assert.equal((await toggleOffer(1,true)).ok,true)
 assert.equal((await saveOffer([2],{...offer,kind:"percent"})).ok,true)
 articles=await loadArticlesForProducts([2]);assert.equal(priceFor(articles.get(2).tiers,6).total,3000,'El cliente recibe la combinación más barata')
 assert.equal((await searchOfferProducts("%" )).length,0)
 assert.ok(state.paths.includes("/"));assert.ok(state.paths.includes("/admin/productos"))
 console.log("OK: migración, permisos admin, validación, guardado, pausa/reactivación y catálogo real con ofertas")
} finally {hooks.deregister();delete globalThis.__offerActionQA;await memory.close()}
