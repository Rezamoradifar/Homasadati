"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { RecordData, labels } from "./client";
import { DataState, Form, Pagination, Stat, Table, useData } from "./Widgets";
export default function BinaryPanel({
  user,
  admin = false,
  refresh,
}: {
  user: RecordData;
  admin?: boolean;
  refresh: number;
}) {
  const [root, setRoot] = useState(user.id),
    [page, setPage] = useState(1);
  const state = useData(
    `${admin ? "admin/" : ""}binary?user=${encodeURIComponent(root)}&page=${page}`,
    refresh,
  );
  const select = (id: string) => {
    setRoot(id);
    setPage(1);
  };
  return (
    <Localized>
      <>
        {admin && (
          <div className="portal-card">
            <Form
              fields={[{ name: "user", label: "شناسهٔ کاربر" }]}
              submit="نمایش شبکه"
              onSubmit={async (d) => select(d.user)}
            />
          </div>
        )}
        <DataState state={state}>
          {(d) => (
            <Localized>
              <>
                <section className="portal-card">
                  <div className="portal-row">
                    <h2>درخت جایگاه باینری</h2>
                    <button
                      className="portal-button"
                      onClick={() => select(user.id)}
                    >
                      ریشهٔ من
                    </button>
                  </div>
                  <p>
                    این ساختار بر اساس جایگاه چپ و راست است؛ ساختار معرف‌ها در
                    بخش شبکه و دعوت نمایش داده می‌شود.
                  </p>
                  <div className="binary-root">
                    <strong translate="no">{d.root.name}</strong>
                  </div>
                  <div className="binary-branches">
                    {(["left", "right"] as const).map((leg) => (
                      <section className="binary-leg" key={leg}>
                        <h3>{leg === "left" ? "شاخه چپ" : "شاخه راست"}</h3>
                        <Branch
                          nodes={d.nodes}
                          parent={root}
                          leg={leg}
                          onSelect={admin ? select : undefined}
                        />
                      </section>
                    ))}
                  </div>
                  <p className="portal-muted">
                    نمایش تا سه سطح؛ مدیر می‌تواند با انتخاب عضو، زیرشاخه او را
                    بررسی کند.
                  </p>
                </section>
                <div className="portal-stats">
                  <Stat label="حجم باقی‌مانده چپ" value={d.left.remaining} />
                  <Stat label="حجم باقی‌مانده راست" value={d.right.remaining} />
                  <Stat label="حجم مصرف‌شده چپ" value={d.left.consumed} />
                  <Stat label="حجم مصرف‌شده راست" value={d.right.consumed} />
                  <Stat label="حجم منقضی چپ" value={d.left.expired} />
                  <Stat label="حجم منقضی راست" value={d.right.expired} />
                </div>
                <div className="portal-stats">
                  <Stat
                    label="پورسانت باینری معلق"
                    value={d.commissions.pending}
                  />
                  <Stat
                    label="پورسانت باینری آزادشده"
                    value={d.commissions.available}
                  />
                </div>
                <p className="portal-notice">
                  حجم قابل تطبیق به‌تنهایی تعهد پرداخت نیست؛ پرداخت تابع پلن
                  ثبت‌شده، بودجه سفارش و شرایط دریافت پورسانت است. مبلغ آزادشده،
                  جمع پورسانت‌هاست و مانده کیف پول نیست.
                </p>
                <section className="portal-card">
                  <h2>دفتر حجم باینری</h2>
                  <Table
                    rows={d.rows}
                    columns={[
                      ["order_id", "سفارش"],
                      ["leg", "شاخه", "status"],
                      ["volume", "حجم ورودی", "money"],
                      ["remaining", "باقی‌مانده", "money"],
                      ["void", "باطل‌شده", "bool"],
                      ["created_at", "تاریخ", "date"],
                      ["expires_at", "پایان اعتبار", "date"],
                    ]}
                  />
                </section>
                <section className="portal-card">
                  <h2>تاریخچه تعادل‌ها</h2>
                  <Table
                    rows={d.matches}
                    columns={[
                      ["volume", "حجم تطبیق", "money"],
                      ["left_volume", "مصرف چپ", "money"],
                      ["right_volume", "مصرف راست", "money"],
                      ["amount", "پورسانت", "money"],
                      ["status", "وضعیت", "status"],
                      ["void", "باطل‌شده", "bool"],
                      ["available_at", "زمان آزادسازی", "date"],
                    ]}
                  />
                </section>
                <section className="portal-card">
                  <h2>سابقه جابه‌جایی این عضو</h2>
                  <Table
                    rows={d.events}
                    columns={[
                      ["reason", "دلیل تغییر"],
                      ["before_json", "قبل"],
                      ["after_json", "بعد"],
                      ["created_at", "تاریخ", "date"],
                    ]}
                  />
                </section>
                <Pagination
                  page={page}
                  more={d.hasMore || d.matchesHasMore}
                  onChange={setPage}
                />
              </>
            </Localized>
          )}
        </DataState>
      </>
    </Localized>
  );
}
function Branch({
  nodes,
  parent,
  leg,
  onSelect,
}: {
  nodes: RecordData[];
  parent: string;
  leg: string;
  onSelect?: (id: string) => void;
}) {
  const node = nodes.find((n) => n.parent_id === parent && n.leg === leg);
  if (!node)
    return (
      <Localized>
        <p className="binary-empty">جایگاه خالی</p>
      </Localized>
    );
  return (
    <Localized>
      <div className="binary-node">
        {onSelect ? (
          <button className="portal-button" onClick={() => onSelect(node.id)}>
            <span translate="no">{node.name}</span>
          </button>
        ) : (
          <strong translate="no">{node.name}</strong>
        )}
        <small>
          {labels[node.leg]}
          {node.blocked ? " · مسدود" : ""}
        </small>
        {node.depth < 3 && (
          <div className="binary-children">
            {["left", "right"].map((side) => (
              <Branch
                key={side}
                nodes={nodes}
                parent={node.id}
                leg={side}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </Localized>
  );
}
