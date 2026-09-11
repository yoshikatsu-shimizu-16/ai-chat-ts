import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const sourceFiles = await Array.fromAsync(
  glob(["app/**/*.{ts,tsx}", "lib/**/*.ts"], { exclude: ["**/*.d.ts"] }),
);
const missingJsdocLocations = [];
const duplicateJsdocLocations = [];

for (const sourceFile of sourceFiles) {
  const sourceText = await readFile(sourceFile, "utf8");
  const sourceLines = sourceText.split("\n");
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    if (sourceLines[lineIndex].trim().startsWith("/**")) {
      let previousLineIndex = lineIndex - 1;
      while (previousLineIndex >= 0 && sourceLines[previousLineIndex].trim() === "") previousLineIndex -= 1;
      if (sourceLines[previousLineIndex]?.trim().endsWith("*/")) duplicateJsdocLocations.push(`${sourceFile}:${lineIndex + 1}`);
    }
    const functionMatch = sourceLines[lineIndex].match(
      /^(\s*)(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    );
    if (!functionMatch) continue;
    let documentationEndIndex = lineIndex - 1;
    while (documentationEndIndex >= 0 && sourceLines[documentationEndIndex].trim() === "") {
      documentationEndIndex -= 1;
    }
    if (!sourceLines[documentationEndIndex]?.trim().endsWith("*/")) {
      missingJsdocLocations.push(`${sourceFile}:${lineIndex + 1}`);
      continue;
    }
    let documentationStartIndex = documentationEndIndex;
    while (documentationStartIndex >= 0 && !sourceLines[documentationStartIndex].includes("/**")) {
      documentationStartIndex -= 1;
    }
    const documentation = sourceLines.slice(documentationStartIndex, documentationEndIndex + 1).join("\n");
    const parameters = functionMatch[4].split(",").map((parameter) => parameter.trim()).filter(Boolean);
    if (functionMatch[2] && parameters.some((parameter) => !documentation.includes(`@param ${parameter.split(/[=:?]/)[0].trim()}`))) {
      missingJsdocLocations.push(`${sourceFile}:${lineIndex + 1} (missing @param)`);
    }
    if (!documentation.includes("@returns")) missingJsdocLocations.push(`${sourceFile}:${lineIndex + 1} (missing @returns)`);
  }
}

if (missingJsdocLocations.length > 0 || duplicateJsdocLocations.length > 0) {
  if (missingJsdocLocations.length > 0) console.error(`Missing JSDoc:\n${missingJsdocLocations.join("\n")}`);
  if (duplicateJsdocLocations.length > 0) console.error(`Duplicate JSDoc:\n${duplicateJsdocLocations.join("\n")}`);
  process.exitCode = 1;
}
