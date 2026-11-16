// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {platformDb,run,one,all,now} from "./schema";
import {quoteCart} from "./checkout";
import {seedTravelCardProducts,travelCardSku} from "./travel-card-catalog";
import {sevenLevelCards} from "./card-levels";

const dir=mkdtempSync(join(tmpdir(),"homa-travel-card-products-"));
let admin:string;

beforeAll(()=>{
  process.env.DATABASE_PATH=join(dir,"test.sqlite");
  process.env.PLATFORM_MASTER_KEY="a".repeat(64);
  platformDb();
});
beforeEach(()=>{
  vi.stubEnv("HOMA_CHECKOUT_VAT_ENABLED","0");
  vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED","0");
  platformDb().exec("BEGIN");
  admin=randomUUID();
  run("INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,'superadmin',?,?,?,?)",
    admin,"Fixture Admin","unused",admin,now(),now(),"test");
});
afterEach(()=>{if(platformDb().inTransaction)platformDb().exec("ROLLBACK");vi.unstubAllEnvs();});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});

it("creates seven published, correctly priced tourism card products, without trip inventory",()=>{
  expect(seedTravelCardProducts(admin)).toEqual({added:7,existing:0});
  for(const tier of sevenLevelCards){
    const sku=travelCardSku(tier.level);
    const product=one("SELECT p.* FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE d.sku=?",sku)!;
    expect(product).toMatchObject({vertical:"tourism",subtype:"travel_card",title:"کارت گردشگری "+tier.name,
      price:tier.minToman,stock:0,published:1});
    const quote=quoteCart([{productId:product.id,quantity:1}]);
    expect(quote).toMatchObject({total:tier.minToman,requiresAddress:true});
    expect(quote.rows[0]).toMatchObject({travelCard:true,stock:10});
  }
  expect(one("SELECT COUNT(*) n FROM p_products WHERE vertical='tourism'")!.n).toBe(7);
  expect(one("SELECT COUNT(*) n FROM p_audit WHERE action='product.save' AND actor_id=?",admin)!.n).toBe(7);
});

it("is idempotent and leaves staff prices, publication decisions, and old orders alone",()=>{
  seedTravelCardProducts(admin);
  const sku=travelCardSku(1);
  const product=one("SELECT p.id FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE d.sku=?",sku)!;
  run("UPDATE p_products SET price=12345678,published=0 WHERE id=?",product.id);
  expect(seedTravelCardProducts(admin)).toEqual({added:0,existing:7});
  const updated=one("SELECT price,published FROM p_products WHERE id=?",product.id)!;
  expect(updated).toEqual({price:12345678,published:0});
  expect(all("SELECT id FROM p_products WHERE vertical='tourism'")).toHaveLength(7);
});

it("never marks taxability as approved merely because the product is a travel card",()=>{
  seedTravelCardProducts(admin);
  const row=one("SELECT details FROM p_product_details WHERE sku=?",travelCardSku(2))!;
  expect(JSON.parse(row.details).vatStatus).toBe("review");
});
