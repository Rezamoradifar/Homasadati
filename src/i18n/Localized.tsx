"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useSiteLocale } from "./SiteLocale";
import {
  direction,
  translateText,
  type Dictionary,
  type SiteLocale,
} from "./core";
const attributes = ["aria-label", "title", "placeholder", "alt"] as const;
/** Translate rendered UI copy, leaving application data, form values, event
 * handlers and React component identity intact. No DOM mutation or remote service. */
export function localizeNode(
  node: ReactNode,
  locale: SiteLocale,
  dictionary: Dictionary,
): ReactNode {
  if (typeof node === "string") return translateText(node, locale, dictionary);
  if (Array.isArray(node))
    return Children.map(node, (child) =>
      localizeNode(child, locale, dictionary),
    );
  if (!isValidElement(node) || node.type === Localized) return node;
  const element = node as ReactElement<Record<string, any>>,
    props = element.props;
  if (
    props.translate === "no" ||
    props["data-no-translate"] ||
    ["code", "pre", "script", "style"].includes(String(element.type))
  )
    return node;
  const next: Record<string, unknown> = {};
  if (typeof element.type === "string") {
    for (const attr of attributes)
      if (typeof props[attr] === "string")
        next[attr] = translateText(props[attr], locale, dictionary);
    if (
      props.dir === "rtl" &&
      !["input", "textarea", "bdi"].includes(element.type)
    )
      next.dir = direction(locale);
    if (props.lang === "fa") next.lang = locale;
  }
  if (props.children !== undefined)
    next.children = localizeNode(props.children, locale, dictionary);
  return cloneElement(element, next);
}
export default function Localized({ children }: { children: ReactNode }) {
  const { locale, dictionary } = useSiteLocale();
  return <>{localizeNode(children, locale, dictionary)}</>;
}
