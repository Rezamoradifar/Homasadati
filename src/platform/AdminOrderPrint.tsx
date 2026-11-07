"use client";

import { useEffect, useRef, useState } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";
import { OrderDocumentState, useOrderDocument } from "./AdminOrderDetails";
import OrderDocumentView from "./OrderDocumentView";
import documentCopy from "./order-document-copy.json";

export default function AdminOrderPrint({ orderId }: { orderId: string }) {
  const { locale } = useSiteLocale();
  const copy = documentCopy[locale];
  const state = useOrderDocument(orderId);
  const [printing, setPrinting] = useState(false);
  const printLock = useRef(false);
  const readyOrder = useRef<string | null>(null);
  readyOrder.current = state.data && !state.loading ? orderId : null;
  useEffect(() => () => { readyOrder.current = null; }, []);
  async function printDocument() {
    if (!state.data || state.loading || printLock.current) return;
    const selectedOrder = orderId;
    printLock.current = true;
    setPrinting(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      if (readyOrder.current === selectedOrder) window.print();
    } finally {
      printLock.current = false;
      setPrinting(false);
    }
  }
  return <main className="order-print-page" dir={locale === "en" ? "ltr" : "rtl"} lang={locale}>
    <header className="order-print-toolbar">
      <div><h1>{copy.preview}</h1><p>{copy.paper}</p></div>
      <div className="order-document-actions">
        <button className="order-document-button order-document-button--primary" type="button" disabled={!state.data || state.loading || printing} onClick={printDocument}>{copy.printAction}</button>
        <a className="order-document-button" href="/admin?tab=orders">{copy.back}</a>
      </div>
      <p className="order-print-help">{copy.printHelp}</p>
    </header>
    <OrderDocumentState {...state} />
    {state.data && <OrderDocumentView document={state.data} variant="print" />}
  </main>;
}
