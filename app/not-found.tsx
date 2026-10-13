"use client";
import { CommerceShell } from '../src/commerce/Shell';
import { useSiteLocale } from '../src/i18n/SiteLocale';
const copy={
 fa:{title:'این صفحه پیدا نشد',body:'ممکن است نشانی تغییر کرده باشد. از صفحهٔ اصلی یا فروشگاه ادامه دهید؛ برای پیگیری سفارش به حساب خود بروید.',home:'صفحهٔ اصلی',shop:'فروشگاه',orders:'سفارش‌های من'},
 en:{title:'Page not found',body:'The address may have changed. Continue from the home page or shop, or open your account to track an order.',home:'Home',shop:'Shop',orders:'My orders'},
 ar:{title:'الصفحة غير موجودة',body:'قد يكون العنوان قد تغيّر. تابع من الصفحة الرئيسية أو المتجر، أو افتح حسابك لمتابعة الطلب.',home:'الرئيسية',shop:'المتجر',orders:'طلباتي'},
};
export default function NotFound(){const {locale}=useSiteLocale(),c=copy[locale];return <CommerceShell><main id="commerce-main" className="site-error"><span aria-hidden="true">404</span><h1>{c.title}</h1><p>{c.body}</p><div><a href="/">{c.home}</a><a href="/shop">{c.shop}</a><a href="/account?tab=orders">{c.orders}</a></div></main></CommerceShell>;}
