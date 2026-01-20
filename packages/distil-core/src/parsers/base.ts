/**
 * Base parser interface
 *
 * All language parsers must implement this interface to ensure
 * consistent behavior across different languages.
 */

import type {
  Language,
  ModuleInfo,
  CFGInfo,
  DFGInfo,
  PDGInfo,
} from '../types/index.js';

/**
 * Language parser interface
 *
 * Provides extraction methods for all analysis layers.
 * Each language implements this interface using tree-sitter.
 */
export interface LanguageParser {
  /** Language identifier */
  readonly language: Language;

  /** File extensions this parser handles */
  readonly extensions: readonly string[];

  /**
   * Check if this parser can handle a file
   */
  canHandle(filePath: string): boolean;

  /**
   * L1: Extract AST information from source code
   *
   * @param source - Source code string
   * @param filePath - File path (for error messages)
   * @returns ModuleInfo with functions, classes, imports
   */
  extractAST(source: string, filePath: string): Promise<ModuleInfo>;

  /**
   * L2: Extract function calls from source code
   *
   * @param source - Source code string
   * @param filePath - File path
   * @returns Map of function name -> called function names
   */
  extractCalls(source: string, filePath: string): Promise<Map<string, string[]>>;

  /**
   * L3: Extract control flow graph for a function
   *
   * @param source - Source code string
   * @param functionName - Name of function to analyze
   * @param filePath - File path
   * @returns CFGInfo or null if function not found
   */
  extractCFG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<CFGInfo | null>;

  /**
   * L4: Extract data flow graph for a function
   *
   * @param source - Source code string
   * @param functionName - Name of function to analyze
   * @param filePath - File path
   * @returns DFGInfo or null if function not found
   */
  extractDFG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<DFGInfo | null>;

  /**
   * L5: Extract program dependence graph for a function
   *
   * @param source - Source code string
   * @param functionName - Name of function to analyze
   * @param filePath - File path
   * @returns PDGInfo or null if function not found
   */
  extractPDG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<PDGInfo | null>;
}

/**
 * Parser registration
 */
const parsers = new Map<Language, LanguageParser>();

/**
 * Register a parser for a language
 */
export function registerParser(parser: LanguageParser): void {
  parsers.set(parser.language, parser);
}

/**
 * Get parser for a language
 */
export function getParserForLanguage(language: Language): LanguageParser | null {
  return parsers.get(language) ?? null;
}

/**
 * Get parser for a file path (based on extension)
 */
export function getParserForFile(filePath: string): LanguageParser | null {
  for (const parser of parsers.values()) {
    if (parser.canHandle(filePath)) {
      return parser;
    }
  }
  return null;
}

/**
 * Get all registered parsers
 */
export function getAllParsers(): LanguageParser[] {
  return Array.from(parsers.values());
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: Language): boolean {
  return parsers.has(language);
}
