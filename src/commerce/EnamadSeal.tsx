/** The eNamad trust seal: the owner's eNamad logo, wrapped in the official
 * eNamad embed link (referrerpolicy="origin", id, Code and the code
 * attribute), so a click opens the verification page for homanets.com. */
export default function EnamadSeal({ id, code, className }: { id: string; code: string; className?: string }) {
  const query = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;
  return (
    <a
      className={"enamad-seal " + (className || "")}
      referrerPolicy="origin"
      target="_blank"
      rel="noopener"
      href={`https://trustseal.enamad.ir/?${query}`}
      aria-label="نماد اعتماد الکترونیکی؛ استعلام در سایت اینماد"
    >
      <img
        className="enamad-seal-logo"
        referrerPolicy="origin"
        src="/assets/licenses/enamad-seal.png"
        alt="نماد اعتماد الکترونیکی"
        width={167}
        height={58}
        style={{ cursor: "pointer" }}
        {...{ code }}
      />
    </a>
  );
}
