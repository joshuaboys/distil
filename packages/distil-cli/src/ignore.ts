import type { Command } from "commander";

export interface CliIgnoreOptions {
  useIgnore: boolean;
}

export function resolveCliIgnoreOptions(command: Command): CliIgnoreOptions {
  const globalOptions = command.optsWithGlobals() as {
    // Commander turns --no-ignore into { ignore: false }
    ignore?: boolean;
    // Keep compatibility if noIgnore appears from custom parsing.
    noIgnore?: boolean;
  };

  if (typeof globalOptions.ignore === "boolean") {
    return { useIgnore: globalOptions.ignore };
  }

  return {
    useIgnore: !(globalOptions.noIgnore ?? false),
  };
}
