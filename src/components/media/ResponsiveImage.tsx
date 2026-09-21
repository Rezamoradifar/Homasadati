"use client";
import Image from "next/image";
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
