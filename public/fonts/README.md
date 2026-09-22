# Persian font

The site uses **Vazirmatn** for all Persian text. It is released under the SIL Open Font License 1.1, so it is free to use on a commercial website, and it is bundled through the `@fontsource/vazirmatn` package. No font files are needed here.

## Switching to a licensed brand font later

Farhang and IRANSharp are commercial fonts. Use them only after buying a **web licence** from the official seller. Then:

1. Put the licensed `woff2` files in this folder, for example `public/fonts/farhang/Farhang-Regular.woff2` and `Farhang-Bold.woff2`.
2. In `app/brand.css`, add an `@font-face` rule for each file and set
   `--font-fa: "Farhang", "Vazirmatn";`
