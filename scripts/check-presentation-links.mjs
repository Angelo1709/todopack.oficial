// Acciones y catálogo reales contra Postgres en memoria; sin cuentas ni datos de producción.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {registerHooks} from 'node:module'
import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import {priceFor} from '../lib/pricing.ts'
import {photoArticles} from '../lib/photo-articles.ts'
const memory=new PGlite()
await memory.exec(readFileSync(new URL('../lib/db/migrations/0001_init.sql',import.meta.url),'utf8'))
await memory.exec(readFileSync(new URL('../lib/db/migrations/0009_portal_fotos.sql',import.meta.url),'utf8'))
const state=globalThis.__presentationLinkChecks={db:drizzle(memory),admin:false,uploads:0,paths:[]}
const stub=code=>`data:text/javascript,${encodeURIComponent(code)}`
const mocks={
 '@/lib/db':stub('export const db=globalThis.__presentationLinkChecks.db'),
 '@/lib/session':stub("export async function requireAdmin(){if(!globalThis.__presentationLinkChecks.admin)throw Error('Forbidden');return {id:'test'}}"),
 '@/lib/storage':stub('export async function persistImage(url){globalThis.__presentationLinkChecks.uploads++;return url}'),
 'next/cache':stub('export function revalidatePath(path){globalThis.__presentationLinkChecks.paths.push(path)}'),
 'server-only':stub(''),
}
const root=new URL('../',import.meta.url)
const hooks=registerHooks({resolve(specifier,context,next){
 if(mocks[specifier])return {url:mocks[specifier],shortCircuit:true}
 if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true}
 return next(specifier,context)
}})
const photoA='00000000-0000-4000-8000-000000000001',photoB='00000000-0000-4000-8000-000000000002',photoC='00000000-0000-4000-8000-000000000003'
const url=id=>'/api/fotos-productos/'+id
await memory.exec(`INSERT INTO products(id,name,price,category,pack_size,group_key,image_url) VALUES
 (1,'9 DE ORO AGRIDULCE 200G',1200,'Snacks y Golosinas',1,'9 de oro agridulce 200g','${url(photoA)}'),
 (2,'9 DE ORO AGRIDULCE 200GR X20 UNIDADES',22000,'Snacks y Golosinas',1,'pack sin clasificar','${url(photoB)}'),
 (3,'7UP UNIDAD',2700,'Gaseosas',1,'seven unitario',NULL),
 (4,'7UP PACK',15000,'Gaseosas',1,'seven pack','${url(photoB)}'),
 (5,'OTRO PACK',44000,'Snacks y Golosinas',40,'otro pack',NULL),
 (6,'FOTO PENDIENTE',1000,'Gaseosas',1,'pendiente','${url(photoC)}');
 INSERT INTO product_photo_candidates(id,product_id,filename,mime_type,image_data,sha256,status) VALUES
 ('${photoA}',1,'unidad.png','image/png',decode('89504e470d0a1a0a00000000','hex'),'aaa','confirmada'),
 ('${photoB}',2,'pack.png','image/png',decode('89504e470d0a1a0a00000000','hex'),'bbb','confirmada'),
 ('${photoC}',6,'pendiente.png','image/png',decode('89504e470d0a1a0a00000000','hex'),'ccc','pendiente');`)
const get=async id=>(await memory.query('SELECT * FROM products WHERE id=$1',[id])).rows[0]
const edit=async(id,extra={})=>{const p=await get(id);return {id,name:p.name,price:p.price,category:p.category,packSize:p.pack_size,groupKey:p.group_key??'',imageUrl:p.image_url??'',active:p.active,...extra}}
try {
 const {saveProduct,unlinkProductPresentation,searchProductsForLink}=await import('../app/actions/catalog.ts')
 const {loadArticlesForProducts}=await import('../lib/catalog.ts')
 await assert.rejects(()=>saveProduct({}),/Forbidden/)
 await assert.rejects(()=>unlinkProductPresentation(2),/Forbidden/)
 state.admin=true
 assert.equal((await saveProduct(await edit(1))).ok,true,'Editar una foto interna confirmada no se rechaza ni se vuelve a subir')
 assert.equal(state.uploads,0)
 assert.equal((await saveProduct(await edit(2,{linkToId:1,linkCurrentIsPack:true,linkPackSize:20}))).ok,true)
 let unit=await get(1),pack=await get(2)
 assert.equal(unit.pack_size,1);assert.equal(pack.pack_size,20);assert.equal(unit.group_key,pack.group_key)
 assert.equal(unit.price,1200);assert.equal(pack.price,22000);assert.equal(pack.image_url,url(photoA))
 let articles=await loadArticlesForProducts([1,2]);assert.equal(articles.get(1).key,articles.get(2).key);assert.equal(articles.get(1).tiers.length,2)
 assert.equal(priceFor(articles.get(1).tiers,21).total,23200);assert.equal(priceFor(articles.get(1).tiers,41).total,45200)
 let result=await saveProduct(await edit(3,{linkToId:4,linkCurrentIsPack:false,linkPackSize:6}));assert.equal(result.ok,true,'También vincula editando el unitario')
 assert.equal((await get(4)).pack_size,6);assert.equal((await get(3)).image_url,url(photoB))
 articles=await loadArticlesForProducts([3,4]);assert.equal(priceFor(articles.get(3).tiers,11).total,28500)
 const before=await get(5)
 result=await saveProduct(await edit(5,{linkToId:1,linkCurrentIsPack:true,linkPackSize:20}));assert.equal(result.ok,false,'No oculta un precio de pack repetido')
 assert.deepEqual(await get(5),before,'Revierte todo el guardado si no puede vincular')
 for(const size of [0,1,1.5,1001]) assert.equal((await saveProduct(await edit(5,{linkToId:1,linkCurrentIsPack:true,linkPackSize:size}))).ok,false)
 assert.equal((await saveProduct(await edit(2,{linkToId:2,linkPackSize:20}))).ok,false)
 assert.equal((await saveProduct(await edit(2,{linkToId:9999,linkPackSize:20}))).ok,false)
 assert.equal((await saveProduct(await edit(6))).ok,false,'No publica una foto pendiente')
 await memory.query('UPDATE products SET active=false WHERE id=5')
 assert.equal((await saveProduct(await edit(2,{linkToId:5,linkPackSize:20}))).ok,false)
 assert.equal((await searchProductsForLink('OTRO')).length,0,'El buscador sólo ofrece productos activos')
 assert.equal((await unlinkProductPresentation(2)).ok,true)
 pack=await get(2);assert.notEqual(pack.group_key,(await get(1)).group_key);assert.equal(pack.pack_size,20);assert.equal(pack.price,22000);assert.equal(pack.image_url,url(photoA))
 assert.equal((await saveProduct(await edit(2))).ok,true);assert.equal((await get(2)).group_key,pack.group_key,'Editar luego de separar no vuelve a agrupar')
 assert.equal((await saveProduct(await edit(2,{linkToId:1,linkCurrentIsPack:true,linkPackSize:20}))).ok,true,'Se puede volver a vincular')
 const rows=(await memory.query('SELECT id,name,pack_size AS "packSize",group_key AS "groupKey",image_url AS "imageUrl" FROM products WHERE id IN (1,2)')).rows
 assert.equal(photoArticles({products:rows,candidates:[]}).length,1,'El portal revisa una sola foto por artículo')
 assert.ok(state.paths.includes('/admin/fotos'))
 assert.equal((await memory.query('SELECT count(*)::int AS count FROM product_photo_candidates')).rows[0].count,3,'Conserva todas las candidatas e historial')
 assert.equal((await memory.query('SELECT sum(version)::int AS versions FROM product_photo_candidates')).rows[0].versions,3,'Vincular no modifica las decisiones de fotos')
 console.log('OK: fotos internas, unidad/pack desde ambos lados, x6/x20, precio mixto, duplicados, rollback, permisos, separación reversible y una foto por artículo.')
} finally {hooks.deregister();delete globalThis.__presentationLinkChecks;await memory.close()}
