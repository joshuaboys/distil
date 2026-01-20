/**
 * Extract command
 *
 * Extracts file structure (L1 AST) from a source file.
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getParser, type ModuleInfo } from '@edda-distil/core';

export const extractCommand = new Command('extract')
  .description('Extract file structure (L1 AST)')
  .argument('<file>', 'File to analyze')
  .option('--json', 'Output as JSON')
  .option('--compact', 'Output compact format for LLM')
  .action(async (file: string, options: { json?: boolean; compact?: boolean }) => {
    try {
      const filePath = resolve(file);
      const source = await readFile(filePath, 'utf-8');

      const parser = getParser(filePath);
      if (!parser) {
        console.error(`Error: Unsupported file type: ${file}`);
        process.exit(1);
      }

      const moduleInfo = await parser.extractAST(source, filePath);

      if (options.compact) {
        console.log(JSON.stringify(moduleInfo.toCompact(), null, 2));
      } else if (options.json) {
        console.log(JSON.stringify(moduleInfo.toJSON(), null, 2));
      } else {
        // Human-readable output
        printModuleInfo(moduleInfo);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

function printModuleInfo(info: ModuleInfo): void {
  const fileName = info.filePath.split('/').pop() ?? info.filePath;
  console.log(`\n📄 ${fileName} (${info.language})`);
  console.log('─'.repeat(50));

  if (info.docstring) {
    console.log(`\n📝 ${info.docstring.slice(0, 100)}${info.docstring.length > 100 ? '...' : ''}`);
  }

  if (info.imports.length > 0) {
    console.log(`\n📦 Imports (${info.imports.length}):`);
    for (const imp of info.imports.slice(0, 10)) {
      const names = imp.names.length > 0
        ? `{ ${imp.names.map((n: { alias: string | null; name: string }) => n.alias ?? n.name).join(', ')} }`
        : '';
      console.log(`   ${imp.module} ${names}`);
    }
    if (info.imports.length > 10) {
      console.log(`   ... and ${info.imports.length - 10} more`);
    }
  }

  if (info.functions.length > 0) {
    console.log(`\n⚡ Functions (${info.functions.length}):`);
    for (const fn of info.functions) {
      const exported = fn.isExported ? '📤 ' : '';
      const async = fn.isAsync ? 'async ' : '';
      console.log(`   ${exported}${async}${fn.signature()}`);
    }
  }

  if (info.classes.length > 0) {
    console.log(`\n🏛️  Classes (${info.classes.length}):`);
    for (const cls of info.classes) {
      const exported = cls.isExported ? '📤 ' : '';
      console.log(`   ${exported}${cls.signature()}`);
      for (const method of cls.methods.slice(0, 5)) {
        const vis = method.visibility === 'private' ? '🔒 ' : '';
        console.log(`      ${vis}${method.name}()`);
      }
      if (cls.methods.length > 5) {
        console.log(`      ... and ${cls.methods.length - 5} more methods`);
      }
    }
  }

  if (info.interfaces.length > 0) {
    console.log(`\n📋 Interfaces (${info.interfaces.length}):`);
    for (const iface of info.interfaces) {
      console.log(`   ${iface.name}`);
    }
  }

  if (info.typeAliases.length > 0) {
    console.log(`\n🏷️  Types (${info.typeAliases.length}):`);
    for (const type of info.typeAliases) {
      console.log(`   ${type.name}`);
    }
  }

  console.log('\n');
}
