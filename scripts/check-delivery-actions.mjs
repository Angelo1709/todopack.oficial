// Ejecuta las acciones reales con dependencias aisladas: no conecta con producción.
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { DELIVERY_SETTINGS_DEFAULTS,deliveryInstant } from "../lib/delivery-schedule.ts"

const realNow=Date.now
const state=globalThis.__deliveryActionChecks={admin:false,writes:[],paths:[],values:{...DELIVERY_SETTINGS_DEFAULTS},clock:0,shift:0,changed:null}
const stub = code=>`data:text/javascript,${encodeURIComponent(code)}`
const mocks={
  "@/lib/session":stub(`export async function getSessionUser(){return null} export async function requireUser(){throw Error('Unauthorized')} export async function requireAdmin(){if(!globalThis.__deliveryActionChecks.admin)throw Error('Forbidden');return {id:'test-admin'}}`),
  "@/lib/settings":stub(`export async function getDeliverySettings(){return {...globalThis.__deliveryActionChecks.values}}`),
  "@/lib/db/schema":stub(`export const orders={name:'orders',id:'id',publicToken:'publicToken'};export const orderItems={name:'order_items'};export const settings={name:'settings',key:'key'};`),
  "@/lib/db":stub(`export const db={insert(table){return {values(values){const s=globalThis.__deliveryActionChecks;s.writes.push({table:table.name,values});return {async returning(){return [{id:1,publicToken:'test-token'}]},async onConflictDoUpdate(){for(const v of values)s.values[v.key]=v.value}}}}}}`),
  "@/lib/catalog":stub(`export async function loadArticlesForProducts(){const s=globalThis.__deliveryActionChecks;s.clock+=s.shift;if(s.changed)s.values=s.changed;return new Map([[2,{key:'9oro',name:'9 DE ORO',baseId:2,tiers:[{productId:2,name:'UNIDAD',label:'Unidad',packSize:1,price:1200},{productId:692,name:'PACK X20',label:'Pack x20',packSize:20,price:22000}]}]])}`),
  "@/lib/order-location":stub(`export async function locateOrder(){}`),
  "next/cache":stub(`export function revalidatePath(path){globalThis.__deliveryActionChecks.paths.push(path)}`),
  "next/server":stub(`export function after(){}`),
}
const root=new URL("../",import.meta.url)
const hooks=registerHooks({resolve(specifier,context,next){
  if(mocks[specifier])return {url:mocks[specifier],shortCircuit:true}
  if(specifier.startsWith("@/"))return {url:new URL(specifier.slice(2)+".ts",root).href,shortCircuit:true}
  return next(specifier,context)
}})
Date.now=()=>state.clock
const reset=()=>{state.writes=[];state.paths=[];state.values={...DELIVERY_SETTINGS_DEFAULTS};state.clock=deliveryInstant("2026-10-07","10:59");state.shift=0;state.changed=null}
const input={items:[{id:2,quantity:21}],customerName:"Cliente de prueba",phone:"3415550000",address:"Dirección de prueba",deliveryDate:"2026-10-07",deliverySlot:"mediodia",deliveryWindow:"12:00–15:00",paymentMethod:"efectivo"}
try {
  const {createOrder}=await import("../app/actions/orders.ts")
  const {updateDeliverySettings,getDeliveryBookingData}=await import("../app/actions/delivery.ts")
  reset();assert.equal((await updateDeliverySettings(DELIVERY_SETTINGS_DEFAULTS)).ok,false);assert.equal(state.writes.length,0)
  state.admin=true;assert.equal((await updateDeliverySettings({...DELIVERY_SETTINGS_DEFAULTS,deliveryNightStart:"14:00"})).ok,false);assert.equal(state.writes.length,0)
  const changed={...DELIVERY_SETTINGS_DEFAULTS,deliveryLeadMinutes:"90"}
  assert.equal((await updateDeliverySettings(changed)).ok,true);assert.equal(state.values.deliveryLeadMinutes,"90");assert.equal(state.writes[0].values.length,5)
  assert.ok(state.paths.includes("/checkout"));assert.ok(state.paths.includes("/admin/configuracion"))
  const publicData=await getDeliveryBookingData();assert.deepEqual(Object.keys(publicData.values).sort(),Object.keys(DELIVERY_SETTINGS_DEFAULTS).sort())
  reset();state.clock=deliveryInstant("2026-10-07","11:30");let result=await createOrder(input);assert.equal(result.ok,false);assert.equal(result.field,"deliverySlot");assert.equal(state.writes.length,0)
  reset();state.shift=60_000;result=await createOrder(input);assert.equal(result.ok,false,"Revalidación cuando la consulta cruza el límite exacto");assert.equal(state.writes.length,0)
  reset();state.changed={...DELIVERY_SETTINGS_DEFAULTS,deliveryLeadMinutes:"120"};result=await createOrder(input);assert.equal(result.ok,false,"Configuración actualizada durante el cálculo");assert.equal(state.writes.length,0)
  reset();result=await createOrder({...input,deliveryWindow:"13:00–15:00"});assert.equal(result.ok,false,"Horario mostrado distinto del actual");assert.equal(state.writes.length,0)
  reset();result=await createOrder({...input,deliveryDate:"2026-02-31"});assert.equal(result.ok,false);assert.equal(state.writes.length,0)
  reset();result=await createOrder(input);assert.equal(result.ok,true);assert.equal(result.order.deliveryWindow,"12:00–15:00");assert.equal(result.order.total,23200)
  assert.equal(state.writes[0].values.deliveryWindow,"12:00–15:00")
  console.log("OK: permisos admin, guardado de 5 ajustes, lectura pública limitada, franja cerrada, cruce de límite, configuración obsoleta y horario conservado en pedidos.")
} finally {Date.now=realNow;hooks.deregister();delete globalThis.__deliveryActionChecks}
