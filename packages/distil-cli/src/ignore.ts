import type { Command } from "commander";

export interface CliIgnoreOptions {
  useIgnore: boolean;
}

export function resolveCliIgnoreOptions(command: Command): CliIgnoreOptions {
  const globalOptions = command.optsWithGlobals() as { noIgnore?: boolean };
  return {
    useIgnore: !(globalOptions.noIgnore ?? false),
  };
}
