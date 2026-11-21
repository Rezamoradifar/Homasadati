# Persian font

The site uses **Vazirmatn** for Persian text through the existing `@fontsource/vazirmatn` dependency. The standalone maintenance page also serves the following local files, copied unchanged from version `5.3.0` of that package:

| File in this folder | Package source | Purpose |
| --- | --- | --- |
| `vazirmatn-arabic-400-normal.woff2` | `@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2` | Regular Persian text, weight 400 |
| `vazirmatn-arabic-600-normal.woff2` | `@fontsource/vazirmatn/files/vazirmatn-arabic-600-normal.woff2` | Semibold Persian text, weight 600 |
| `Vazirmatn-OFL.txt` | `@fontsource/vazirmatn/LICENSE` | Copyright notice and SIL Open Font License 1.1 |

`public/site-maintenance.html` loads these fonts directly from `/fonts/`, so its typography works without the application bundle or a third-party font request. Keep the accompanying [license and copyright notice](Vazirmatn-OFL.txt) with the font files when distributing them. These files do not change the application's existing package-based font imports.

## Switching to a licensed brand font later

Farhang and IRANSharp are commercial fonts. Use them only after buying a **web licence** from the official seller. Then:

1. Put the licensed `woff2` files in this folder, for example `public/fonts/farhang/Farhang-Regular.woff2` and `Farhang-Bold.woff2`.
2. In `app/brand.css`, add an `@font-face` rule for each file and set
   `--font-fa: "Farhang", "Vazirmatn";`
