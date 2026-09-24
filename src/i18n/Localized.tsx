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
  hasTranslation,
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
  if (Array.isArray(node)) {
    // React splits sentences around interpolated numbers. Translate a known
    // complete sentence before falling back to its individual fragments.
    const result: ReactNode[] = [];
    let text: (string | number)[] = [];
    const flush = () => {
      if (!text.length) return;
      const sentence = text.join("");
      if (locale !== "fa" && hasTranslation(sentence, dictionary))
        result.push(translateText(sentence, locale, dictionary));
      else
        result.push(
          ...text.map((part) => localizeNode(part, locale, dictionary)),
        );
      text = [];
    };
    Children.forEach(Children.toArray(node), (child) => {
      if (typeof child === "string" || typeof child === "number")
        text.push(child);
      else {
        flush();
        result.push(localizeNode(child, locale, dictionary));
      }
    });
    flush();
    return result;
  }
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
  for (const attr of attributes)
    if (typeof props[attr] === "string")
      next[attr] = translateText(props[attr], locale, dictionary);
  if (typeof element.type === "string") {
    if (
      element.type === "option" &&
      props.value === undefined &&
      (typeof props.children === "string" || typeof props.children === "number")
    )
      next.value = props.children;
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
