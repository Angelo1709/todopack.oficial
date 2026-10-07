"use client"

import { startTransition,useCallback,useEffect,useRef,useState } from "react"
import { getDeliveryBookingData } from "@/app/actions/delivery"
import type { DeliverySettings } from "@/lib/delivery-schedule"

/** Avanza con tiempo monotónico desde el reloj del servidor; ignora el reloj del dispositivo. */
export function useDeliveryBooking(initial:DeliverySettings,serverNow:number) {
  const [values,setValues]=useState(initial)
  const [now,setNow]=useState(serverNow)
  const anchor=useRef({server:serverNow,local:0})
  const mounted=useRef(false)
  const syncing=useRef(false)
  const refreshBooking=useCallback(async()=>{
    if (syncing.current) return
    syncing.current=true
    try {
      const data=await getDeliveryBookingData()
      if (!mounted.current) return
      anchor.current={server:data.now,local:performance.now()}
      setValues(data.values);setNow(data.now)
    } catch { /* El servidor valida nuevamente al confirmar si no hay conexión. */ }
    finally {syncing.current=false}
  },[])
  useEffect(()=>{
    mounted.current=true
    anchor.current={server:serverNow,local:performance.now()}
    const refresh=()=>startTransition(async()=>{await refreshBooking()})
    refresh()
    const clock=setInterval(()=>setNow(anchor.current.server+performance.now()-anchor.current.local),1000)
    const config=setInterval(refresh,60_000)
    const visibility=()=>{if(document.visibilityState==="visible") refresh()}
    window.addEventListener("focus",refresh)
    document.addEventListener("visibilitychange",visibility)
    return ()=>{mounted.current=false;clearInterval(clock);clearInterval(config);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",visibility)}
  },[serverNow,refreshBooking])
  return {values,now,refreshBooking}
}
