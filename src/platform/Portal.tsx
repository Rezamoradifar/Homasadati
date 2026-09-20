"use client";
import { useEffect, useState } from "react";
import "./panel.css";
import { useSiteSettings } from "./SiteSettings";
import { OperationsDashboard } from "./OperationsDashboard";
import {TravelCards,AdminTravel} from "./TravelCards";
import ThemeToggle from "../commerce/ThemeToggle";
import AuthPanel from "./AuthPanel";
import { api, labels, RecordData } from "./client";
import { Notice, Listing } from "./Widgets";
import {
  Addresses,
  Catalog,
  commissionColumns,
  Dashboard,
  Missions,
  Network,
  Notifications,
  Orders,
  Profile,
  Security,
  Subscriptions,
  Wallet,
} from "./UserPanel";
import {
  AdminCrud,
  AdminNetwork,
  AdminOrders,
  AdminUsers,
  AdminWithdrawals,
  CommissionPolicy,
  FinancialDashboard,
  Flags,
  Settings,
} from "./AdminPanel";
const userTabs = [
  ["dashboard", "نمای کلی"],
  ["catalog", "خرید و رزرو"],
  ["orders", "سفارش‌ها"],
  ["network", "شبکه و دعوت"],
  ["commissions", "پورسانت‌ها"],
  ["missions", "مأموریت‌ها"],
  ["wallet", "کیف پول و برداشت"],
  ["travel-cards", "کارت سفر من"],
  ["subscriptions", "اشتراک‌های من"],
  ["notifications", "اعلان‌ها"],
  ["profile", "پروفایل"],
  ["addresses", "آدرس‌ها"],
  ["security", "امنیت حساب"],
];
const adminTabs: [string, string, string[]][] = [
  ["travel", "کارت سفر و کارگزار", ["superadmin","finance","support"]],
  ["operations", "داشبورد کسب‌وکار", ["superadmin", "finance"]],
  ["operations-tourism", "داشبورد گردشگری", ["superadmin", "finance"]],
  ["operations-beauty", "داشبورد زیبایی", ["superadmin", "finance"]],
  ["operations-craft", "داشبورد صنایع‌دستی", ["superadmin", "finance"]],
  ["operations-ai", "داشبورد هوش مصنوعی", ["superadmin", "finance"]],
  ["operations-leather", "داشبورد چرم ایران", ["superadmin", "finance"]],
  ["dashboard", "سلامت مالی", ["superadmin", "finance"]],
  ["products", "محصولات و تورها", ["superadmin", "content"]],
  ["taxonomy", "دسته‌ها و برچسب‌ها", ["superadmin", "content"]],
  ["orders", "سفارش‌ها", ["superadmin", "finance", "support"]],
  ["withdrawals", "درخواست‌های برداشت", ["superadmin", "finance"]],
  ["users", "اعضای مجموعه", ["superadmin", "support"]],
  ["network", "مدیریت شبکه", ["superadmin"]],
  ["commissions", "دفتر پورسانت", ["superadmin", "finance"]],
  ["policy", "نرخ‌ها و کنترل پرداخت", ["superadmin", "finance"]],
  ["ranks", "رتبه‌ها", ["superadmin", "finance"]],
  ["missions", "مأموریت‌ها", ["superadmin", "content"]],
  ["reports", "گزارش‌ها", ["superadmin", "finance"]],
  ["content", "مدیریت محتوا", ["superadmin", "content"]],
  ["flags", "بررسی حساب‌ها", ["superadmin", "support"]],
  ["audit", "تاریخچهٔ تغییرات", ["superadmin"]],
  ["settings", "تنظیمات سیستم", ["superadmin"]],
  ["security", "امنیت حساب", ["superadmin", "content", "finance", "support"]],
];
export default function Portal({ admin = false }: { admin?: boolean }) {
  const site = useSiteSettings();
  const [user, setUser] = useState<RecordData | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("dashboard"),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const update = () => setRefresh((n) => n + 1);
  useEffect(() => {
    let live = true;
    api("me")
      .then((r) => {
        if (live) {
          setUser(r.user);
          const t = new URLSearchParams(location.search).get("tab");
          if (t) setTab(t);
          else if (admin && r.user.role === "content") setTab("products");
          else if (admin && r.user.role === "support") setTab("orders");
          else if (admin) setTab("operations");
        }
      })
      .catch((e) => {
        if (live && e.message !== "برای ادامه وارد حساب شوید.")
          setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [admin]);
  useEffect(() => {
    if (!user) return;
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [user]);
  const tabs = admin
    ? adminTabs.filter((t) => user && t[2].includes(user.role))
    : userTabs;
  const current = tabs.find((t) => t[0] === tab);
  const logged = (u: RecordData) => {
    setUser(u);
    setTab(
      admin
        ? u.role === "content"
          ? "products"
          : u.role === "support"
            ? "orders"
            : "dashboard"
        : "dashboard",
    );
  };
  const refreshUser = async () => {
    const r = await api("me");
    setUser(r.user);
    update();
  };
  return (
    <div className="portal" dir="rtl" lang="fa">
      <header className="portal-header">
        <a href="/">
          <strong>{site.site_name || "همای سعادت"}</strong>
          <small>HOMAY SAADAT / {admin ? "MANAGEMENT" : "MEMBERS"}</small>
        </a>
        <div className="portal-toplinks"><ThemeToggle/>
          <a href="/">وب‌سایت</a>
          <a href={admin ? "/account" : "/admin"}>
            {admin ? "حساب من" : "مدیریت"}
          </a>
          {user && (
            <button
              className="portal-button gold"
              onClick={async () => {
                try {
                  await api("auth/logout", "POST");
                  setUser(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              خروج
            </button>
          )}
        </div>
      </header>
      {loading ? (
        <p role="status" className="portal-loading">
          در حال بررسی حساب…
        </p>
      ) : !user ? (
        <>
          <Notice error={error} />
          <AuthPanel admin={admin} onLogin={logged} />
        </>
      ) : admin && user.role === "user" ? (
        <div className="portal-main">
          <Notice error="این حساب دسترسی مدیریتی ندارد." />
          <a href="/account" className="portal-button">
            پنل کاربری
          </a>
        </div>
      ) : (
        <div className="portal-layout">
          <aside className="portal-sidebar">
            <div className="portal-user">
              <strong>{user.name}</strong>
              <span>{labels[user.role]}</span>
            </div>
            <nav aria-label={admin ? "بخش‌های مدیریت" : "بخش‌های حساب"}>
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => {
                    setTab(key);
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
          </aside>
          <main className="portal-main">
            <div className="portal-title">
              <div>
                <h1>{current?.[1] || "پنل همای سعادت"}</h1>
                <p>اطلاعات واقعی حساب · به‌روزرسانی هر ۱۵ ثانیه</p>
              </div>
              <button className="portal-button" onClick={update}>
                تازه‌سازی
              </button>
            </div>
            <Notice error={error} />
            {!current ? (
              <Notice error="بخش انتخاب‌شده در دسترس نیست." />
            ) : tab === "security" ? (
              <Security onReauth={() => setUser(null)} />
            ) : admin ? (
              <>
                {tab.startsWith("operations") && (
                  <OperationsDashboard
                    key={tab}
                    refresh={refresh}
                    vertical={tab.split("-")[1] || ""}
                  />
                )}
                {tab === "travel" && <AdminTravel refresh={refresh} onChange={update} role={user.role}/>}
                {tab === "dashboard" && (
                  <FinancialDashboard refresh={refresh} />
                )}{" "}
                {[
                  "products",
                  "taxonomy",
                  "ranks",
                  "missions",
                  "content",
                ].includes(tab) && (
                  <AdminCrud
                    key={tab}
                    resource={tab}
                    refresh={refresh}
                    onChange={update}
                  />
                )}{" "}
                {tab === "orders" && (
                  <AdminOrders
                    refresh={refresh}
                    onChange={update}
                    role={user.role}
                  />
                )}{" "}
                {tab === "withdrawals" && (
                  <AdminWithdrawals refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "users" && (
                  <AdminUsers
                    refresh={refresh}
                    onChange={update}
                    role={user.role}
                  />
                )}{" "}
                {tab === "network" && (
                  <AdminNetwork
                    refresh={refresh}
                    onChange={update}
                    user={user}
                  />
                )}{" "}
                {tab === "commissions" && (
                  <Listing
                    endpoint="admin/commissions"
                    refresh={refresh}
                    filters={{ dates: true, kind: true }}
                    columns={[["name", "عضو"], ...commissionColumns]}
                  />
                )}{" "}
                {tab === "policy" && (
                  <CommissionPolicy refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "reports" && (
                  <FinancialDashboard refresh={refresh} reportsOnly />
                )}{" "}
                {tab === "flags" && (
                  <Flags refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "audit" && (
                  <Listing
                    endpoint="admin/audit"
                    refresh={refresh}
                    columns={[
                      ["actor_id", "مدیر"],
                      ["action", "عملیات"],
                      ["entity_id", "رکورد"],
                      ["before_json", "قبل"],
                      ["after_json", "بعد"],
                      ["reason", "دلیل"],
                      ["created_at", "زمان", "date"],
                    ]}
                  />
                )}{" "}
                {tab === "settings" && (
                  <Settings refresh={refresh} onChange={update} />
                )}
              </>
            ) : (
              <>
                {tab === "travel-cards" && <TravelCards refresh={refresh} onChange={update}/>}
                {tab === "dashboard" && <Dashboard refresh={refresh} />}{" "}
                {tab === "catalog" && (
                  <Catalog refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "orders" && (
                  <Orders refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "wallet" && (
                  <Wallet refresh={refresh} onChange={update} user={user} />
                )}{" "}
                {tab === "network" && <Network user={user} refresh={refresh} />}{" "}
                {tab === "missions" && <Missions refresh={refresh} />}{" "}
                {tab === "commissions" && (
                  <Listing
                    endpoint="commissions"
                    refresh={refresh}
                    filters={{ dates: true, kind: true }}
                    columns={commissionColumns}
                  />
                )}{" "}
                {tab === "profile" && (
                  <Profile user={user} onChange={refreshUser} />
                )}{" "}
                {tab === "addresses" && (
                  <Addresses refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "subscriptions" && (
                  <Subscriptions refresh={refresh} onChange={update} />
                )}{" "}
                {tab === "notifications" && (
                  <Notifications refresh={refresh} onChange={update} />
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
