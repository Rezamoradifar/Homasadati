"use client";
import dynamic from "next/dynamic";
import { ManagerActivationBadge } from "./ManagerActivationBadge";
import { memberTabIcons } from "./member-icons";

import Localized from "../i18n/Localized";
import { useEffect, useState } from "react";
import "./panel.css";
import "./member-luxury.css";
import { useSiteSettings } from "./SiteSettings";
import { LanguagePicker } from "../i18n/SiteLocale";
import ThemeToggle from "../commerce/ThemeToggle";
import AuthPanel from "./AuthPanel";
import { visibleAdminTabs, searchAdminGroups } from "./admin-navigation";
import { memberNavigation } from "./member-navigation";
import { useSiteLocale } from "../i18n/SiteLocale";
import { translateText } from "../i18n/core";
import { api, labels, PlatformApiError, RecordData } from "./client";
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
function PanelLoading() { return <Localized><p role="status">در حال دریافت اطلاعات…</p></Localized>; }
const AdminCrud = dynamic(() => import("./AdminPanel").then(m => m.AdminCrud), { loading: PanelLoading });
const AdminNetwork = dynamic(() => import("./AdminPanel").then(m => m.AdminNetwork), { loading: PanelLoading });
const AdminOrders = dynamic(() => import("./AdminPanel").then(m => m.AdminOrders), { loading: PanelLoading });
const AdminUsers = dynamic(() => import("./AdminPanel").then(m => m.AdminUsers), { loading: PanelLoading });
const AdminWithdrawals = dynamic(() => import("./AdminPanel").then(m => m.AdminWithdrawals), { loading: PanelLoading });
const CommissionPolicy = dynamic(() => import("./AdminPanel").then(m => m.CommissionPolicy), { loading: PanelLoading });
const FinancialDashboard = dynamic(() => import("./AdminPanel").then(m => m.FinancialDashboard), { loading: PanelLoading });
const Flags = dynamic(() => import("./AdminPanel").then(m => m.Flags), { loading: PanelLoading });
const Settings = dynamic(() => import("./AdminPanel").then(m => m.Settings), { loading: PanelLoading });
const BinaryRulesPanel = dynamic(() => import("./PlatformControls").then(m => m.BinaryRulesPanel), { loading: PanelLoading });
const LoyaltyRulesPanel = dynamic(() => import("./PlatformControls").then(m => m.LoyaltyRulesPanel), { loading: PanelLoading });
const AccessPanel = dynamic(() => import("./PlatformControls").then(m => m.AccessPanel), { loading: PanelLoading });
const MerchantOperationsPanel = dynamic(() => import("./PlatformControls").then(m => m.MerchantOperationsPanel), { loading: PanelLoading });
const MerchantSettlementsPanel = dynamic(() => import("./PlatformControls").then(m => m.MerchantSettlementsPanel), { loading: PanelLoading });
const MerchantPanel = dynamic(() => import("./PlatformControls").then(m => m.MerchantPanel), { loading: PanelLoading });
const AdminNotifications = dynamic(() => import("./PlatformControls").then(m => m.AdminNotifications), { loading: PanelLoading });
const TicketsPanel = dynamic(() => import("./SupportPanels").then(m => m.TicketsPanel), { loading: PanelLoading });
const BinarySchedulePanel = dynamic(() => import("./SupportPanels").then(m => m.BinarySchedulePanel), { loading: PanelLoading });
const TravelCards = dynamic(() => import("./TravelCards").then(m => m.TravelCards), { loading: PanelLoading });
const AdminTravel = dynamic(() => import("./TravelCards").then(m => m.AdminTravel), { loading: PanelLoading });
const ClubCatalogAdmin = dynamic(() => import("./ClubPanels").then(m => m.ClubCatalogAdmin), { loading: PanelLoading });
const PointsAdmin = dynamic(() => import("./ClubPanels").then(m => m.PointsAdmin), { loading: PanelLoading });
const RedemptionsAdmin = dynamic(() => import("./ClubPanels").then(m => m.RedemptionsAdmin), { loading: PanelLoading });
const LoyaltyPanel = dynamic(() => import("./ClubPanels").then(m => m.LoyaltyPanel), { loading: PanelLoading });
const AdminNewsletter = dynamic(() => import("./AdminNewsletter").then(m => m.AdminNewsletter), { loading: PanelLoading });
const MarketerOffice = dynamic(() => import("./MarketerOffice").then(m => m.MarketerOffice), { loading: PanelLoading });
const OperationsDashboard = dynamic(() => import("./OperationsDashboard").then(m => m.OperationsDashboard), { loading: PanelLoading });
const NetworkTree = dynamic(() => import("./NetworkTree").then(m => m.NetworkTree), { loading: PanelLoading });
const Wishlist = dynamic(() => import("./Wishlist").then(m => m.Wishlist), { loading: PanelLoading });
const AdminHome = dynamic(() => import("./AdminHome"), { loading: PanelLoading });
const BinaryPanel = dynamic(() => import("./BinaryPanel"), { loading: PanelLoading });
const SevenCardPanel = dynamic(() => import("./SevenCardPanel"), { loading: PanelLoading });
const MemberKit = dynamic(() => import("./MemberKit"), { loading: PanelLoading });
export default function Portal({ admin = false }: { admin?: boolean }) {
  const site = useSiteSettings();
  const { locale, dictionary } = useSiteLocale();
  const [navQuery, setNavQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const [user, setUser] = useState<RecordData | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("dashboard"),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const update = () => setRefresh((n) => n + 1);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setConnectionError("");
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
        if (
          live &&
          !(e instanceof PlatformApiError && e.code === "unauthorized")
        )
          setConnectionError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [admin, connectionAttempt]);
  useEffect(() => {
    const expired = () => {
      if (!user) return;
      setUser(null);
      setMenuOpen(false);
      setConnectionError("");
      setError("نشست شما پایان یافته است؛ دوباره وارد حساب شوید.");
    };
    window.addEventListener("platform-session-expired", expired);
    return () =>
      window.removeEventListener("platform-session-expired", expired);
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let live = true,
      checking = false;
    const id = setInterval(async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const r = await api("me");
        if (live) {
          setUser(r.user);
          setConnectionError("");
          update();
        }
      } catch (e) {
        if (
          live &&
          !(e instanceof PlatformApiError && e.code === "unauthorized")
        )
          setConnectionError((e as Error).message);
      } finally {
        checking = false;
      }
    }, 15000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [user?.id]);
  const userGroups = memberNavigation(Boolean(user?.merchant), Boolean(user?.marketerOffice?.enabled));
  const tabs = admin
    ? visibleAdminTabs(user?.role || "", user?.permissions)
    : userGroups.flatMap((group) => group.tabs);
  const current = tabs.find((t) => t[0] === tab);
  const logged = (u: RecordData) => {
    setUser(u);
    setError("");
    setConnectionError("");
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
      setTab(
        new URLSearchParams(location.search).get("tab") ||
          (admin ? "home" : "dashboard"),
      );
      setMenuOpen(false);
      setError("");
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, [admin]);
  const navigationGroups = searchAdminGroups(
    user?.role || "",
    "",
    user?.permissions,
  )
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        ([key, label]) =>
          !navQuery.trim() ||
          searchAdminGroups(user?.role || "", navQuery, user?.permissions).some(
            (g) => g.tabs.some((t) => t[0] === key),
          ) ||
          translateText(label, locale, dictionary)
            .toLowerCase()
            .includes(navQuery.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.tabs.length > 0);
  const refreshUser = async () => {
    const r = await api("me");
    setUser(r.user);
    setConnectionError("");
    update();
  };
  return (
    <Localized>
      <div
        className={`portal ${admin ? "portal-admin" : "portal-member"} ${!admin && tab === "dashboard" ? "portal-member-dashboard" : ""}`}
        dir="rtl"
        lang="fa"
      >
        <header className="portal-header">
          <a href="/" className="portal-brand">
            <img src={site.site_logo || "/assets/brand-mark.png"} alt="" width={40} height={40} />
            <span>
              <strong>{site.site_name || "هما نت"}</strong>
              <small>HOMANET / {admin ? "MANAGEMENT" : "MEMBERS"}</small>
            </span>
          </a>
          <div className="portal-toplinks">
            <LanguagePicker />
            <ThemeToggle />
            <a href="/">وب‌سایت</a>
            {(admin ||
              (user &&
                visibleAdminTabs(user.role, user.permissions).length > 0)) && (
              <a href={admin ? "/account" : "/admin"}>
                {admin ? "حساب من" : "مدیریت"}
              </a>
            )}
            {user && (
              <button
                className="portal-button gold"
                onClick={async () => {
                  try {
                    await api("auth/logout", "POST");
                    setUser(null);
                    setError("");
                    setConnectionError("");
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
        ) : !user && connectionError ? (
          <main className="portal-card portal-auth">
            <h1>اتصال به حساب برقرار نشد</h1>
            <Notice error={connectionError} />
            <button
              className="portal-button"
              onClick={() => setConnectionAttempt((n) => n + 1)}
            >
              تلاش دوباره
            </button>
          </main>
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
          <div className="portal-layout" key={user.id}>
            <aside className="portal-sidebar">
              {admin && (
                <div className="portal-user">
                  <strong translate="no">{user.name}</strong>
                  <span>{labels[user.role]}</span>
                </div>
              )}
              {admin ? (
                <>
                  <button
                    type="button"
                    className="admin-menu-toggle"
                    aria-expanded={menuOpen}
                    aria-controls="admin-navigation"
                    onClick={() => setMenuOpen(!menuOpen)}
                  >
                    بخش‌های مدیریت{" "}
                    <span aria-hidden="true">{menuOpen ? "−" : "+"}</span>
                  </button>
                  <div
                    id="admin-navigation"
                    className={`admin-navigation${menuOpen ? " is-open" : ""}`}
                  >
                    <label className="admin-nav-search">
                      <span>جست‌وجوی بخش‌ها</span>
                      <input
                        type="search"
                        value={navQuery}
                        placeholder="نام بخش را بنویسید"
                        onChange={(e) => setNavQuery(e.target.value)}
                      />
                    </label>
                    <nav aria-label="بخش‌های مدیریت">
                      {navigationGroups.map((group) => (
                        <section key={group.title}>
                          <h2>{group.title}</h2>
                          {group.tabs.map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              aria-current={tab === key ? "page" : undefined}
                              onClick={() => selectTab(key)}
                            >
                              {label}
                            </button>
                          ))}
                        </section>
                      ))}
                      {navigationGroups.length === 0 && (
                        <p role="status">بخشی با این نام پیدا نشد.</p>
                      )}
                    </nav>
                  </div>
                </>
              ) : (
                <>
                  <div className={"member-profile-card"+(user.managerActivated?" manager-activated":"")}>
                    <span className="member-avatar" aria-hidden="true">
                      {String(user.name || "").trim().slice(0, 1)}
                    </span>
                    <strong>
                      سلام <bdi translate="no">{user.name}</bdi> عزیز!
                    </strong>
                    <small>
                      کد معرف: <bdi dir="ltr">{user.referral_code}</bdi>
                    </small>
                    <ManagerActivationBadge active={user.managerActivated}/>
                  </div>
                  <button
                    className="member-menu-toggle"
                    type="button"
                    aria-expanded={menuOpen}
                    aria-controls="member-navigation"
                    onClick={() => setMenuOpen(!menuOpen)}
                  >
                    بخش‌های حساب{" "}
                    <span aria-hidden="true">{menuOpen ? "−" : "+"}</span>
                  </button>
                  <nav
                    id="member-navigation"
                    className={menuOpen ? "is-open" : ""}
                    aria-label="بخش‌های حساب"
                  >
                    {userGroups.map((group) => (
                      <section key={group.title}>
                        <h2>{group.title}</h2>
                        {group.tabs.map(([key, label]) => {
                          const Icon = memberTabIcons[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-current={tab === key ? "page" : undefined}
                              onClick={() => selectTab(key)}
                            >
                              {Icon && <Icon size={18} aria-hidden="true" />}
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </section>
                    ))}
                  </nav>
                </>
              )}
            </aside>
            <main className="portal-main">
              {!admin && user.companyPositions && !user.companyPositions.exempt && user.companyPositions.status!=="qualified" && <section className="portal-card position-company-note" role="status"><h2>{user.companyPositions.status==="suspended"?"جایگاه شرکتی معلق است":"مهلت فعال‌سازی دو جایگاه اول"}</h2><p>مهلت جایگاه شرکتی: ۳۵ روز از تخصیص · {Number(user.companyPositions.remainingDays).toLocaleString("fa-IR")} روز باقی‌مانده</p><p>خرید واقعی لازم: {(Math.max(0,20000000-user.companyPositions.realPurchaseToman)*10).toLocaleString("fa-IR")} ریال</p><a className="portal-button" href="/shop">خرید و فعال‌سازی جایگاه</a></section>}
              <div className="portal-title">
                <div>
                  <h1>{!admin && tab === "dashboard" ? "حساب من" : current?.[1] || "پنل هما نت"}</h1>
                  <p>
                    {connectionError
                      ? "ارتباط قطع است؛ اطلاعات ممکن است قدیمی باشد."
                      : admin ? "اطلاعات حساب · بررسی به‌روزرسانی هر ۱۵ ثانیه" : "خلاصه حساب شما"}
                  </p>
                </div>
                <button
                  className="portal-button"
                  onClick={() =>
                    refreshUser().catch((e) => {
                      if (!(
                        e instanceof PlatformApiError &&
                        e.code === "unauthorized"
                      ))
                        setConnectionError(e.message);
                    })
                  }
                >
                  تازه‌سازی
                </button>
              </div>
              <Notice error={error} />
              <Notice error={connectionError} />
              {!current ? (
                <Notice error="بخش انتخاب‌شده در دسترس نیست." />
              ) : tab === "security" ? (
                <Security onReauth={() => setUser(null)} />
              ) : admin ? (
                <>
                  {tab === "seven-card-plan" && <SevenCardPanel admin />}
                  {tab === "binary" && (
                    <BinaryPanel user={user} admin refresh={refresh} />
                  )}
                  {tab === "binary-rules" && (
                    <BinaryRulesPanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "tickets" && (
                    <TicketsPanel staff refresh={refresh} onChange={update} />
                  )}
                  {tab === "binary-schedule" && (
                    <BinarySchedulePanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "loyalty-policy" && (
                    <LoyaltyRulesPanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "access" && (
                    <AccessPanel refresh={refresh} onChange={refreshUser} />
                  )}
                  {tab === "newsletter" && (
                    <AdminNewsletter refresh={refresh} onChange={update} />
                  )}
                  {tab === "merchant-operations" && (
                    <MerchantOperationsPanel
                      refresh={refresh}
                      onChange={update}
                    />
                  )}
                  {tab === "merchant-settlements" && (
                    <MerchantSettlementsPanel
                      refresh={refresh}
                      onChange={update}
                      userId={user.id}
                    />
                  )}
                  {tab === "notifications" && (
                    <AdminNotifications refresh={refresh} onChange={update} />
                  )}
                  {(tab === "merchants" || tab === "rewards") && (
                    <ClubCatalogAdmin
                      key={tab}
                      resource={tab}
                      refresh={refresh}
                      onChange={update}
                    />
                  )}
                  {tab === "loyalty" && (
                    <PointsAdmin refresh={refresh} onChange={update} />
                  )}
                  {tab === "redemptions" && (
                    <RedemptionsAdmin refresh={refresh} onChange={update} />
                  )}
                  {tab === "home" && (
                    <AdminHome
                      user={user}
                      refresh={refresh}
                      onNavigate={selectTab}
                    />
                  )}
                  {tab.startsWith("operations") && (
                    <OperationsDashboard
                      key={tab}
                      refresh={refresh}
                      vertical={tab.split("-")[1] || ""}
                    />
                  )}
                  {tab === "travel" && (
                    <AdminTravel
                      refresh={refresh}
                      onChange={update}
                      role={user.role}
                    />
                  )}
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
                    <>
                      <NetworkTree user={user} refresh={refresh} admin />
                      <AdminNetwork
                        refresh={refresh}
                        onChange={update}
                        user={user}
                      />
                    </>
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
                  {tab === "tickets" && (
                    <TicketsPanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "marketer-office" && <MarketerOffice user={user} refresh={refresh} />}
                  {tab === "merchant" && (
                    <MerchantPanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "seven-card-plan" && <SevenCardPanel />}
                  {tab === "member-kit" && <MemberKit />}
                  {tab === "binary" && (
                    <BinaryPanel user={user} refresh={refresh} />
                  )}
                  {tab === "wishlist" && (
                    <Wishlist refresh={refresh} onNavigate={selectTab} />
                  )}
                  {tab === "loyalty" && (
                    <LoyaltyPanel refresh={refresh} onChange={update} />
                  )}
                  {tab === "travel-cards" && (
                    <TravelCards refresh={refresh} onChange={update} />
                  )}
                  {tab === "dashboard" && (
                    <Dashboard
                      refresh={refresh}
                      user={user}
                      onNavigate={selectTab}
                    />
                  )}{" "}
                  {tab === "catalog" && (
                    <Catalog refresh={refresh} onChange={update} />
                  )}{" "}
                  {tab === "orders" && (
                    <Orders refresh={refresh} onChange={update} />
                  )}{" "}
                  {tab === "wallet" && (
                    <Wallet refresh={refresh} onChange={update} user={user} />
                  )}{" "}
                  {tab === "network" && (
                    <>
                      <NetworkTree user={user} refresh={refresh} />
                      <Network user={user} refresh={refresh} />
                    </>
                  )}{" "}
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
            {!admin && (
              <nav className="member-luxe-bottomnav" aria-label="دسترسی سریع">
                {([
                  ["dashboard", "نمای کلی"],
                  ["catalog", "خرید و رزرو"],
                  ["wallet", "کیف پول"],
                  ["profile", "پروفایل"],
                ] as const).map(([key, label]) => {
                  const Icon = memberTabIcons[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-current={tab === key ? "page" : undefined}
                      onClick={() => selectTab(key)}
                    >
                      {Icon && <Icon size={21} aria-hidden="true" />}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}
      </div>
    </Localized>
  );
}
