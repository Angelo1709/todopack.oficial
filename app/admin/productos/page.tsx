import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { count, eq, isNull, and } from "drizzle-orm"
import { CatalogToolbar } from "@/components/admin/catalog-toolbar"

export const dynamic = "force-dynamic"

export default async function AdminProductsPage() {
  const [[{ total }], [{ withoutImage }]] = await Promise.all([
    db.select({ total: count() }).from(products).where(eq(products.active, true)),
    db
      .select({ withoutImage: count() })
      .from(products)
      .where(and(eq(products.active, true), isNull(products.imageUrl))),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {total} productos activos · {withoutImage} sin imagen
          </p>
        </div>
        <CatalogToolbar />
      </div>
    </div>
  )
}
