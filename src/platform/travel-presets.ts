import { ApiError } from "../server/http";
import { randomUUID } from "node:crypto";
import { all, one, run, atomic, now } from "./schema";
import { audit } from "./security";
export function travelPresets() {
  return all(
    `SELECT p.*,COALESCE(r.name,p.name) AS display_name,COALESCE(r.personal_threshold,p.personal_threshold) AS threshold,COALESCE(r.group_threshold,0) AS group_threshold,COALESCE(t.amount,p.credit) AS amount,COALESCE(t.valid_days,p.valid_days) AS duration,COALESCE(t.active,0) AS active FROM p_travel_presets p LEFT JOIN p_ranks r ON r.id=p.rank_id LEFT JOIN p_travel_rules t ON t.rank_id=r.id ORDER BY p.level`,
  );
}
export function installTravelPresets(actor: string) {
  return atomic(() => {
    for (const p of all("SELECT * FROM p_travel_presets ORDER BY level")) {
      if (p.rank_id) continue;
      if (one("SELECT id FROM p_ranks WHERE name=?", p.name))
        throw new ApiError(409, "rank_name_conflict");
      const id = randomUUID();
      run(
        "INSERT INTO p_ranks VALUES(?,?,?,0,0)",
        id,
        p.name,
        p.personal_threshold,
      );
      run(
        "INSERT INTO p_travel_rules VALUES(?,?,?,0,?)",
        id,
        p.credit,
        p.valid_days,
        now(),
      );
      run("UPDATE p_travel_presets SET rank_id=? WHERE level=?", id, p.level);
      audit(
        actor,
        "travel.rank.draft",
        id,
        null,
        {
          name: p.name,
          threshold: p.personal_threshold,
          credit: p.credit,
          active: false,
        },
        "ایجاد ساختار پیشنهادی هشت رتبه؛ صدور غیرفعال",
      );
    }
    return travelPresets();
  });
}
