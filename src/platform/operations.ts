import { all, one, now } from "./schema";
export function operations(vertical: string, from: string, to: string) {
  const catalog = one(
    `SELECT COUNT(*) products, COALESCE(SUM(p.published),0) published,
    COALESCE(SUM(CASE WHEN p.stock=0 THEN 1 ELSE 0 END),0) outOfStock,
    COALESCE(SUM(CASE WHEN p.stock>0 AND p.stock<=COALESCE(json_extract(d.details,'$.lowStock'),0) THEN 1 ELSE 0 END),0) lowStock,
    COALESCE(SUM(p.stock),0) units, COALESCE(SUM(p.stock*p.price),0) retailValue
    FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE (?='' OR p.vertical=?)`,
    vertical,
    vertical,
  );
  const sales = one(
    `SELECT COUNT(*) orders,
    COALESCE(SUM(CASE WHEN paid_at IS NOT NULL AND refunded_at IS NULL THEN amount ELSE 0 END),0) revenue,
    COALESCE(SUM(CASE WHEN paid_at IS NOT NULL AND refunded_at IS NULL THEN 1 ELSE 0 END),0) paidOrders,
    COALESCE(SUM(CASE WHEN refunded_at IS NOT NULL THEN amount ELSE 0 END),0) refunds,
    COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) pending,
    COALESCE(SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END),0) processing,
    COALESCE(SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END),0) shipped,
    COALESCE(SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END),0) delivered
    FROM p_orders WHERE (?='' OR vertical=?) AND created_at>=? AND created_at<=?`,
    vertical,
    vertical,
    from,
    to,
  )!;
  const top = all(
    `SELECT product_id,title,SUM(quantity) units,SUM(amount) revenue,COUNT(*) orders
    FROM p_orders WHERE (?='' OR vertical=?) AND paid_at>=? AND paid_at<=? AND refunded_at IS NULL
    GROUP BY product_id,title ORDER BY revenue DESC LIMIT 10`,
    vertical,
    vertical,
    from,
    to,
  );
  const inventory = all(
    `SELECT p.id,p.title,p.vertical,p.stock,d.sku,COALESCE(json_extract(d.details,'$.lowStock'),0) threshold
    FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id
    WHERE (?='' OR p.vertical=?) AND p.stock<=COALESCE(json_extract(d.details,'$.lowStock'),0)
    ORDER BY p.stock,p.title LIMIT 50`,
    vertical,
    vertical,
  );
  const queue = all(
    `SELECT id,title,vertical,amount,status,created_at FROM p_orders WHERE (?='' OR vertical=?) AND status IN ('processing','shipped') ORDER BY created_at LIMIT 30`,
    vertical,
    vertical,
  );
  const trend = all(
    `SELECT substr(paid_at,1,10) day,SUM(amount) sales FROM p_orders
    WHERE (?='' OR vertical=?) AND paid_at>=? AND paid_at<=? AND refunded_at IS NULL
    GROUP BY substr(paid_at,1,10) ORDER BY day`,
    vertical,
    vertical,
    from,
    to,
  );
  const subscriptions =
    !vertical || vertical === "ai"
      ? one(
          `SELECT COUNT(*) total,
    COALESCE(SUM(CASE WHEN cancelled=0 AND expires_at>? THEN 1 ELSE 0 END),0) active,
    COALESCE(SUM(CASE WHEN cancelled=0 AND expires_at>? AND expires_at<=? THEN 1 ELSE 0 END),0) expiring
    FROM p_subscriptions`,
          now(),
          now(),
          new Date(Date.now() + 7 * 86400000).toISOString(),
        )
      : null;
  return {
    catalog,
    sales,
    top,
    inventory,
    queue,
    trend,
    subscriptions,
    averageOrder: sales.paidOrders
      ? Math.floor(sales.revenue / sales.paidOrders)
      : 0,
  };
}
