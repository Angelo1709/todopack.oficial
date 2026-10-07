"use client"

import { useState,useTransition } from "react"
import { toast } from "sonner"
import { Clock3,Moon,Sun } from "lucide-react"
import { updateDeliverySettings } from "@/app/actions/delivery"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { deliveryWindow,validateDeliverySettings,type DeliverySettings,type DeliverySettingKey,type DeliverySettingErrors } from "@/lib/delivery-schedule"

export function DeliverySettingsForm({initial}:{initial:DeliverySettings}) {
  const [values,setValues]=useState(initial)
  const [errors,setErrors]=useState<DeliverySettingErrors>({})
  const [pending,startTransition]=useTransition()
  const valid=validateDeliverySettings(values).ok
  const limit=(start:string) => {
    const total=Number(start.slice(0,2))*60+Number(start.slice(3))-Number(values.deliveryLeadMinutes)
    const normalized=((total%1440)+1440)%1440
    const time=`${String(Math.floor(normalized/60)).padStart(2,"0")}:${String(normalized%60).padStart(2,"0")}`
    const days=Math.ceil(Math.max(0,-total)/1440)
    return `${time}${days ? ` (${days===1 ? "el día anterior" : `${days} días antes`})` : ""}`
  }
  function set(key:DeliverySettingKey,value:string) {
    setValues(v=>({...v,[key]:value}));setErrors(e=>({...e,[key]:undefined}))
  }
  function onSubmit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async()=>{
      try {
        const result=await updateDeliverySettings(values)
        if (result.ok) {setValues(result.values);setErrors({});toast.success("Horarios de entrega guardados")}
        else {setErrors(result.fieldErrors ?? {});toast.error(result.error)}
      } catch {toast.error("No pudimos guardar los horarios. Revisá la conexión y probá de nuevo.")}
    })
  }
  function field(key:DeliverySettingKey,label:string,type:"time"|"number"="time") {
    return <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} name={key} type={type} value={values[key]} onChange={e=>set(key,e.target.value)}
        min={type==="number" ? 0 : undefined} max={type==="number" ? 10080 : undefined} step={type==="number" ? 1 : 60}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} disabled={pending} />
      {errors[key] && <p id={`${key}-error`} className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  }
  return <form id="entregas" onSubmit={onSubmit} noValidate className="scroll-mt-20 rounded-xl border border-border bg-card p-5">
    <h2 className="flex items-center gap-2 font-semibold"><Clock3 className="size-4 text-primary" /> Horarios y cierre de pedidos</h2>
    <p className="mt-1 text-sm text-muted-foreground">Definí qué significa cada franja y hasta cuándo pueden pedir los clientes. Todos los horarios son de Argentina.</p>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sun className="size-4 text-primary" /> Mediodía</h3>
        <div className="grid grid-cols-2 gap-3">{field("deliveryMiddayStart","Desde")}{field("deliveryMiddayEnd","Hasta")}</div>
      </div>
      <div><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Moon className="size-4 text-primary" /> Noche</h3>
        <div className="grid grid-cols-2 gap-3">{field("deliveryNightStart","Desde")}{field("deliveryNightEnd","Hasta")}</div>
      </div>
    </div>
    <div className="mt-5 max-w-sm">{field("deliveryLeadMinutes","Anticipación mínima (minutos)","number")}
      <p className="mt-1.5 text-xs text-muted-foreground">60 minutos = 1 hora. El límite se cuenta desde el inicio de la franja. Con 0, se puede pedir hasta que empieza.</p>
    </div>
    {valid && <div className="mt-5 rounded-lg bg-muted p-4 text-sm">
      <p className="mb-2 font-medium">Así lo ve el cliente</p>
      <p>Mediodía: {deliveryWindow(values,"mediodia")} · pedidos antes de {limit(values.deliveryMiddayStart)}.</p>
      <p className="mt-1">Noche: {deliveryWindow(values,"noche")} · pedidos antes de {limit(values.deliveryNightStart)}.</p>
      <p className="mt-2 text-xs text-muted-foreground">Al cerrarse una franja, se ofrece el siguiente turno disponible. Los pedidos confirmados conservan el horario acordado.</p>
    </div>}
    <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={pending}>{pending && <Spinner />}{pending ? "Guardando..." : "Guardar horarios de entrega"}</Button>
  </form>
}
