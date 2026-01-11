/**
 * TypeScript parser tests
 */

import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from './typescript.js';

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();

  describe('canHandle', () => {
    it('should handle TypeScript files', () => {
      expect(parser.canHandle('file.ts')).toBe(true);
      expect(parser.canHandle('file.tsx')).toBe(true);
    });

    it('should handle JavaScript files', () => {
      expect(parser.canHandle('file.js')).toBe(true);
      expect(parser.canHandle('file.jsx')).toBe(true);
      expect(parser.canHandle('file.mjs')).toBe(true);
      expect(parser.canHandle('file.cjs')).toBe(true);
    });

    it('should not handle other files', () => {
      expect(parser.canHandle('file.py')).toBe(false);
      expect(parser.canHandle('file.rs')).toBe(false);
    });
  });

  describe('extractAST', () => {
    it('should extract function declarations', async () => {
      const source = `
        function hello(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;
      const result = await parser.extractAST(source, 'test.ts');

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.name).toBe('hello');
      expect(result.functions[0]?.params).toHaveLength(1);
      expect(result.functions[0]?.params[0]?.name).toBe('name');
      expect(result.functions[0]?.params[0]?.type).toBe('string');
      expect(result.functions[0]?.returnType).toBe('string');
    });

    it('should extract async functions', async () => {
      const source = `
        async function fetchData(url: string): Promise<Data> {
          return await fetch(url);
        }
      `;
      const result = await parser.extractAST(source, 'test.ts');

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]?.isAsync).toBe(true);
    });

    it('should extract class declarations', async () => {
      const source = `
        class User {
          name: string;
          
          constructor(name: string) {
            this.name = name;
          }
          
          greet(): string {
            return \`Hello, \${this.name}\`;
          }
        }
      `;
      const result = await parser.extractAST(source, 'test.ts');

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0]?.name).toBe('User');
      expect(result.classes[0]?.methods.length).toBeGreaterThan(0);
    });

    it('should extract imports', async () => {
      const source = `
        import { readFile } from 'fs';
        import path from 'path';
        import * as utils from './utils';
      `;
      const result = await parser.extractAST(source, 'test.ts');

      expect(result.imports).toHaveLength(3);
      expect(result.imports[0]?.module).toBe('fs');
      expect(result.imports[1]?.module).toBe('path');
      expect(result.imports[2]?.module).toBe('./utils');
    });

    it('should extract exports', async () => {
      const source = `
        export function publicFunc() {}
        export default function defaultFunc() {}
      `;
      const result = await parser.extractAST(source, 'test.ts');

      expect(result.functions).toHaveLength(2);
      expect(result.functions[0]?.isExported).toBe(true);
      expect(result.functions[1]?.exportType).toBe('default');
    });
  });

  describe('extractCalls', () => {
    it('should extract function calls', async () => {
      const source = `
        function main() {
          helper();
          process();
        }
        
        function helper() {
          console.log('help');
        }
        
        function process() {
          helper();
        }
      `;
      const calls = await parser.extractCalls(source, 'test.ts');

      expect(calls.get('main')).toContain('helper');
      expect(calls.get('main')).toContain('process');
      expect(calls.get('process')).toContain('helper');
    });
  });
});
