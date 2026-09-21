"use client";
import {BinaryRulesPanel,LoyaltyRulesPanel,AccessPanel,MerchantOperationsPanel,MerchantSettlementsPanel,MerchantPanel,AdminNotifications} from "./PlatformControls";

import Localized from "../i18n/Localized";
import { useEffect, useState } from "react";
import "./panel.css";
import { useSiteSettings } from "./SiteSettings";
import { OperationsDashboard } from "./OperationsDashboard";
import {TravelCards,AdminTravel} from "./TravelCards";
import {LanguagePicker} from '../i18n/SiteLocale';
import ThemeToggle from "../commerce/ThemeToggle";
import AuthPanel from "./AuthPanel";
import AdminHome from "./AdminHome";
import BinaryPanel from "./BinaryPanel";
import {ClubCatalogAdmin, PointsAdmin, RedemptionsAdmin, LoyaltyPanel} from "./ClubPanels";
import { visibleAdminTabs, searchAdminGroups } from "./admin-navigation";
import { useSiteLocale } from "../i18n/SiteLocale";
import { translateText } from "../i18n/core";
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
  ["binary", "شبکه باینری"],
  ["loyalty", "امتیازات و مزایا"],
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
export default function Portal({ admin = false }: { admin?: boolean }) {
  const site = useSiteSettings();
  const {locale, dictionary} = useSiteLocale();
  const [navQuery, setNavQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
          else if (admin) setTab("home");
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
    const id = setInterval(() => {
      update();
      api("me").then(r=>setUser(r.user)).catch(e=>{if(e.message==="برای ادامه وارد حساب شوید.")setUser(null);});
    }, 15000);
    return () => clearInterval(id);
  }, [user?.id]);
  const tabs = admin
    ? visibleAdminTabs(user?.role || "",user?.permissions)
    : user?.merchant ? [...userTabs,["merchant","پنل پذیرنده"]] : userTabs;
  const current = tabs.find((t) => t[0] === tab);
  const logged = (u: RecordData) => {
    setUser(u);
    const requested = new URLSearchParams(location.search).get("tab");
    setTab(requested || (admin ? "home" : "dashboard"));
  };
  const selectTab = (key: string) => {
    setTab(key);
    setError("");
    setMenuOpen(false);
    const url = new URL(location.href);
    url.searchParams.set("tab", key);
    history.pushState(null, "", url);
  };
  useEffect(() => {
    const restoreTab = () => {
      setTab(new URLSearchParams(location.search).get("tab") || (admin ? "home" : "dashboard"));
      setMenuOpen(false);
      setError("");
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, [admin]);
  const navigationGroups = searchAdminGroups(user?.role || "", "",user?.permissions).map(group => ({
    ...group,
    tabs: group.tabs.filter(([key, label]) => !navQuery.trim() ||
      searchAdminGroups(user?.role || "", navQuery,user?.permissions).some(g => g.tabs.some(t => t[0] === key)) ||
      translateText(label, locale, dictionary).toLowerCase().includes(navQuery.trim().toLowerCase())),
  })).filter(group => group.tabs.length > 0);
  const refreshUser = async () => {
    const r = await api("me");
    setUser(r.user);
    update();
  };
  return (
    <Localized><div className={`portal${admin ? " portal-admin" : ""}`} dir="rtl" lang="fa">
      <header className="portal-header">
        <a href="/">
          <strong>{site.site_name || "همای سعادت"}</strong>
          <small>HOMAY SAADAT / {admin ? "MANAGEMENT" : "MEMBERS"}</small>
        </a>
        <div className="portal-toplinks"><LanguagePicker/><ThemeToggle/>
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
      ) : admin && tabs.length === 0 ? (
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
              <strong translate="no">{user.name}</strong>
              <span>{labels[user.role]}</span>
            </div>
            {admin ? <>
              <button type="button" className="admin-menu-toggle" aria-expanded={menuOpen}
                aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>
                بخش‌های مدیریت <span aria-hidden="true">{menuOpen ? "−" : "+"}</span>
              </button>
              <div id="admin-navigation" className={`admin-navigation${menuOpen ? " is-open" : ""}`}>
                <label className="admin-nav-search">
                  <span>جست‌وجوی بخش‌ها</span>
                  <input type="search" value={navQuery} placeholder="نام بخش را بنویسید"
                    onChange={e => setNavQuery(e.target.value)} />
                </label>
                <nav aria-label="بخش‌های مدیریت">
                  {navigationGroups.map(group => <section key={group.title}>
                    <h2>{group.title}</h2>
                    {group.tabs.map(([key, label]) => <button key={key} type="button"
                      aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>{label}</button>)}
                  </section>)}
                  {navigationGroups.length === 0 && <p role="status">بخشی با این نام پیدا نشد.</p>}
                </nav>
              </div>
            </> : <nav aria-label="بخش‌های حساب">
              {tabs.map(([key, label]) => <button key={key} type="button"
                aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>{label}</button>)}
            </nav>}
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
                {tab === "binary" && <BinaryPanel user={user} admin refresh={refresh}/>}
                {tab === "binary-rules" && <BinaryRulesPanel refresh={refresh} onChange={update}/>}
                {tab === "loyalty-policy" && <LoyaltyRulesPanel refresh={refresh} onChange={update}/>}
                {tab === "access" && <AccessPanel refresh={refresh} onChange={refreshUser}/>}
                {tab === "merchant-operations" && <MerchantOperationsPanel refresh={refresh} onChange={update}/>}
                {tab === "merchant-settlements" && <MerchantSettlementsPanel refresh={refresh} onChange={update}/>}
                {tab === "notifications" && <AdminNotifications refresh={refresh} onChange={update}/>}
                {(tab === "merchants" || tab === "rewards") && <ClubCatalogAdmin key={tab} resource={tab} refresh={refresh} onChange={update}/>}
                {tab === "loyalty" && <PointsAdmin refresh={refresh} onChange={update}/>}
                {tab === "redemptions" && <RedemptionsAdmin refresh={refresh} onChange={update}/>}
                {tab === "home" && <AdminHome user={user} refresh={refresh} onNavigate={selectTab} />}
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
                {tab === "merchant" && <MerchantPanel refresh={refresh} onChange={update}/>}
                {tab === "binary" && <BinaryPanel user={user} refresh={refresh}/>}
                {tab === "loyalty" && <LoyaltyPanel refresh={refresh} onChange={update}/>}
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
    </div></Localized>
  );
}
