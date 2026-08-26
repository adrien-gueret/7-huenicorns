import fs from "fs";
import { execSync } from "child_process";
import { minify } from "minify";
import { Packer } from "roadroller";
import { zip, COMPRESSION_LEVEL } from "zip-a-folder";

(async () => {
  // The output folder/zip name defaults to "entry"; pass another name as the
  // first CLI arg (e.g. `node build.mjs entry-wavedash`) to build a variant.
  const outName = process.argv[2] || "entry";
  const outDir = `./${outName}`;
  const outZip = `./${outName}.zip`;

  console.log("Remove previous entry files...");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(outZip, { force: true });

  console.log("Get project files content...");

  // The Wavedash variant uses its own HTML shell when present.
  const htmlFile =
    outName === "entry-wavedash" && fs.existsSync("./index-wd.html")
      ? "./index-wd.html"
      : "./index.html";
  let indexHTML = fs.readFileSync(htmlFile, "utf8");

  let styleCSS = fs.readFileSync("./style.css", "utf8");

  let indexJS = fs
    .readFileSync("./index.js", "utf8")
    .replaceAll("const ", "let ")
    .replaceAll("undefined", "void 0");

  fs.unlinkSync("./index.js");

  console.log("Minify JS...");
  const minifiedJS = await minify.js(indexJS);

  console.log("Minify CSS...");
  const minifiedCSS = await minify.css(styleCSS);

  console.log("Minify HTML...");

  const toBase64Url = (fileName) =>
    `data:image/png;base64,${fs.readFileSync(fileName, {
      encoding: "base64",
    })}`;

  indexHTML = indexHTML
    .replace(
      '<script type="module" src="scripts/index.js"></script>',
      () => `<script>${minifiedJS}</script>`,
    )
    .replace(
      '<link href="./style.css" rel="stylesheet" />',
      () => `<style>${minifiedCSS}</style>`,
    )
    .replaceAll('"use strict";', "");

  // Inline the sprite sheet as base64 when present (kept external during dev).
  if (fs.existsSync("./images/unicorns.png")) {
    indexHTML = indexHTML.replaceAll(
      "images/unicorns.png",
      toBase64Url("./images/unicorns.png"),
    );
  }

  const ids = [...indexHTML.matchAll(/id="([^"]*?)"/g)];

  ids.forEach((id, i) => {
    if (id[1].length > 4 && id[1] !== "title" && id[1]) {
      indexHTML = indexHTML.replaceAll(id[1], "_" + i);
    }
  });

  const minifiedHTML = await minify.html(indexHTML);

  console.log("Pack project...");
  const inputToPack = [
    {
      data: minifiedHTML,
      type: "text",
      action: "write",
    },
  ];

  const packer = new Packer(inputToPack);
  await packer.optimize();

  const packedCode = packer.makeDecoder();

  console.log("Write entry files...");

  fs.mkdirSync(outDir);

  fs.writeFileSync(
    `${outDir}/index.html`,
    `<script>${packedCode.firstLine + packedCode.secondLine}</script>`,
    { encoding: "utf8" },
  );

  console.log("Zip entry folder...");
  await zip(outDir, outZip, { compression: COMPRESSION_LEVEL.high });

  console.log("Compress zip...");
  try {
    await execSync(`ect.exe -9 -zip ${outZip}`, { env: process.env });
  } catch (e) {
    console.warn(
      "⚠ Cannot compress zip, please be sure ect.exe is installed and available from global scope",
    );
  }

  console.log("Get entry size...");
  const { size } = fs.statSync(outZip);

  console.log("Entry size: " + size + " bytes");

  const JS13K_LIMIT_SIZE = 13312;

  const percent = Math.round(((size * 100) / JS13K_LIMIT_SIZE) * 100) / 100;
  const percentOfTotalBudget = "(" + percent + "% of total budget)";

  if (size > JS13K_LIMIT_SIZE) {
    console.error(
      "❌ File is " +
        (size - JS13K_LIMIT_SIZE) +
        "bytes too big! " +
        percentOfTotalBudget,
    );
  } else {
    console.log(
      `✅ All good! ${JS13K_LIMIT_SIZE - size} bytes left. ` +
        percentOfTotalBudget,
    );
  }

  console.log("");
  console.log("Entry generated");
})();
