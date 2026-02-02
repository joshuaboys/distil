/**
 * Parser registry
 *
 * Exports all parsers and provides lookup functions.
 */

export type { LanguageParser } from "./base.js";
export {
  registerParser,
  getParserForLanguage,
  getParserForFile,
  getAllParsers,
  isLanguageSupported,
} from "./base.js";

export { TypeScriptParser, typescriptParser } from "./typescript.js";

import { registerParser } from "./base.js";
import { typescriptParser } from "./typescript.js";

// Register built-in parsers
registerParser(typescriptParser);

/**
 * Get parser for a file (convenience re-export)
 */
export { getParserForFile as getParser } from "./base.js";
