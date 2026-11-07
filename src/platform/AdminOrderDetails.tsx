"use client";

import { useEffect, useState } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";
import { api, PlatformApiError } from "./client";
import type { OrderDocumentData } from "./order-document-types";
import OrderDocumentView from "./OrderDocumentView";
import documentCopy from "./order-document-copy.json";

type DocumentError = "unauthorized" | "forbidden" | "notFound" | "error";
type DocumentState = { id: string; data: OrderDocumentData | null; loading: boolean; error: DocumentError | null };

export function useOrderDocument(orderId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DocumentState>({ id: orderId, data: null, loading: true, error: null });
  useEffect(() => {
    let current = true;
    setState({ id: orderId, data: null, loading: true, error: null });
    api("admin/orders/" + encodeURIComponent(orderId))
      .then(result => {
        if (current) setState({ id: orderId, data: result as unknown as OrderDocumentData, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const code = error instanceof PlatformApiError
          ? error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : error.status === 404 ? "notFound" : "error"
          : "error";
        setState({ id: orderId, data: null, loading: false, error: code });
      });
    return () => { current = false; };
  }, [orderId, attempt]);
  // A newly selected order never renders the previous customer's details before its effect runs.
  const visible = state.id === orderId ? state : { id: orderId, data: null, loading: true, error: null };
  return { ...visible, retry: () => setAttempt(value => value + 1) };
}

export function OrderDocumentState({ loading, error, retry }: { loading: boolean; error: DocumentError | null; retry: () => void }) {
  const { locale } = useSiteLocale();
  const copy = documentCopy[locale];
  if (loading) return <p className="order-document-state" role="status">{copy.loading}</p>;
  if (!error) return null;
  return <div className="order-document-state" role="alert">
    <p>{copy[error]}</p>
    <div className="order-document-actions">
      {error === "unauthorized" && <a className="order-document-button" href="/admin">{copy.login}</a>}
      <button className="order-document-button" type="button" onClick={retry}>{copy.retry}</button>
    </div>
  </div>;
}

export default function AdminOrderDetails({ orderId }: { orderId: string }) {
  const { locale } = useSiteLocale();
  const copy = documentCopy[locale];
  const state = useOrderDocument(orderId);
  return <div className="admin-order-details">
    <OrderDocumentState {...state} />
    {state.data && <>
      <div className="order-document-actions">
        <a className="order-document-button order-document-button--primary" href={`/admin/orders/${encodeURIComponent(orderId)}/print`} target="_blank" rel="noopener noreferrer">{copy.printLink}</a>
      </div>
      <OrderDocumentView document={state.data} />
    </>}
  </div>;
}
