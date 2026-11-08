// Turns every diagram in docs/diagrams into a picture: an .svg for the README and a sharp
// .png to paste into the report. Run with: npm run docs:diagrams
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { erDiagram } from "./er-diagram.mjs";

const DIR = "docs/diagrams";
writeFileSync(path.join(DIR, "er-diagram.mmd"), erDiagram());

const browser = await chromium.launch(
  process.env.CI ? {} : { channel: process.env.E2E_BROWSER ?? "chrome" },
);
// Scale 2 keeps the text crisp when the picture is printed in the report.
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 1000 },
});
await page.setContent(
  '<!doctype html><html><body style="margin:0;background:#fff"><div id="out" style="display:inline-block;padding:16px"></div></body></html>',
);
await page.addScriptTag({ path: "node_modules/mermaid/dist/mermaid.min.js" });

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".mmd"))) {
  const name = file.replace(/\.mmd$/, "");
  const source = readFileSync(path.join(DIR, file), "utf8");
  const svg = await page.evaluate(
    async ({ source, name }) => {
      // Natural size, not squeezed into the window, so the text stays readable.
      const natural = { useMaxWidth: false };
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
        flowchart: natural,
        sequence: natural,
        er: natural,
        state: natural,
      });
      const { svg } = await mermaid.render(`diagram-${name}`, source);
      document.getElementById("out").innerHTML = svg;
      return svg;
    },
    { source, name },
  );
  writeFileSync(path.join(DIR, `${name}.svg`), svg);
  await page.locator("#out").screenshot({ path: path.join(DIR, `${name}.png`) });
  console.log(`Rendered ${name}`);
}

// The use-case diagram is drawn by hand, because Mermaid has no such diagram type.
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:#fff"><div id="out" style="display:inline-block">${readFileSync(path.join(DIR, "use-case.svg"), "utf8")}</div></body></html>`,
);
await page.locator("#out").screenshot({ path: path.join(DIR, "use-case.png") });
console.log("Rendered use-case");

await browser.close();
