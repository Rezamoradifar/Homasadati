"use client";
import Image from "next/image";
import {useSiteLocale} from "../../i18n/SiteLocale";
import {translateText} from "../../i18n/core";
import { forwardRef, type ImgHTMLAttributes } from "react";
import { imageDimensions } from "./image-dimensions";
type Props = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "srcSet" | "width" | "height"
> & { width?: number; height?: number; quality?: number };
/** Local photographs get a real srcset and intrinsic aspect ratio. Remote catalog
 * URLs keep their existing delivery policy; arbitrary origins are not allowlisted. */
const ResponsiveImage = forwardRef<HTMLImageElement, Props>(
  function ResponsiveImage(
    {
      src,
      alt = "",
      sizes = "100vw",
      loading = "lazy",
      width,
      height,
      quality = 85,
      ...rest
    },
    ref,
  ) {
    const {locale,dictionary}=useSiteLocale();
    alt=translateText(alt,locale,dictionary);
    const uploaded=!!src&&/^\/api\/platform\/media\/[a-f0-9-]{36}\.webp$/.test(src);
    if(uploaded)return <img {...rest} ref={ref} src={src} srcSet={[320,640,960,1440].map(w=>`${src}?w=${w} ${w}w`).join(', ')} sizes={sizes} alt={alt} width={width} height={height} loading={loading} decoding="async"/>;
    const dimensions = src ? imageDimensions[src] : undefined;
    if (!src || !dimensions || Math.max(...dimensions) <= 256)
      return (
        <img
          {...rest}
          ref={ref}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
        />
      );
    const priority = rest.fetchPriority === "high";
    return (
      <Image
        {...rest}
        ref={ref}
        src={src}
        alt={alt}
        sizes={sizes}
        width={width || dimensions[0]}
        height={height || dimensions[1]}
        quality={quality}
        priority={priority}
        loading={priority ? undefined : loading}
        decoding="async"
      />
    );
  },
);
export default ResponsiveImage;
