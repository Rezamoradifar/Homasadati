/** A small brand mark stays readable when the image is cropped for mobile. */
export default function ImageBrandMark() {
  return (
    <span className="image-brand-mark" aria-hidden="true" translate="no">
      <img
        src="/assets/brand/homanet-mark-orange.png"
        alt=""
        width={22}
        height={22}
      />
      <bdi>HOMANET</bdi>
    </span>
  );
}
