// Diagnóstico y vínculos explícitos para nombres distintos. Nunca conecta la PC del dueño a PostgreSQL.
// Uso: node --env-file-if-exists=.env.local scripts/stock-links.mjs report
//      node --env-file-if-exists=.env.local scripts/stock-links.mjs link PRODUCT_ID ARTICULO_ID
import pg from "pg"
if (!process.env.DATABASE_URL) throw Error("Falta DATABASE_URL")
const [command = "report", productArg, articleArg] = process.argv.slice(2)
if (!['report','link','unlink'].includes(command)) throw Error("Usá report, link PRODUCT_ID ARTICULO_ID o unlink PRODUCT_ID")
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  if (command === "report") {
    const { rows } = await client.query(`SELECT p.id,p.name,p.gestion_article_id,p.stock_quantity,p.stock_updated_at
      FROM products p WHERE p.active ORDER BY p.stock_quantity IS NOT NULL,p.name`)
    console.table(rows)
    console.log("Artículos disponibles para vincular:")
    console.table((await client.query("SELECT article_id,code,name,quantity FROM gestion_stock ORDER BY name")).rows)
    console.log("Última sincronización:")
    console.table((await client.query("SELECT * FROM stock_sync_state")).rows)
  } else {
    const productId = Number(productArg), articleId = Number(articleArg)
    if (!Number.isSafeInteger(productId) || productId < 1 || (command === "link" && (!Number.isSafeInteger(articleId) || articleId < 1))) throw Error("IDs inválidos")
    await client.query("BEGIN")
    try {
      await client.query("SELECT pg_advisory_xact_lock(9137301)")
      const product = (await client.query("SELECT id,name FROM products WHERE id=$1 FOR UPDATE", [productId])).rows[0]
      if (!product) throw Error("No existe ese producto de la web")
      if (command === "link") {
        const source = (await client.query("SELECT * FROM gestion_stock WHERE article_id=$1", [articleId])).rows[0]
        if (!source) throw Error("No existe ese artículo en el inventario recibido")
        await client.query("UPDATE products SET gestion_article_id=$2,stock_quantity=$3,stock_updated_at=$4 WHERE id=$1", [productId, articleId, source.quantity, source.updated_at])
        console.log(`${product.name} -> Gestión ${source.article_id}: ${source.name}. Stock: ${source.quantity}`)
      } else {
        await client.query("UPDATE products SET gestion_article_id=NULL,stock_quantity=NULL,stock_updated_at=NULL WHERE id=$1", [productId])
        console.log(`Vínculo eliminado de ${product.name}. Si el nombre coincide exactamente se vinculará en la próxima captura.`)
      }
      await client.query("COMMIT")
    } catch (error) { await client.query("ROLLBACK"); throw error }
  }
} finally { await client.end() }
