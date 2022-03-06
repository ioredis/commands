import commands from "./commands.json";

/**
 * Redis command list
 *
 * All commands are lowercased.
 */
export const list = Object.keys(commands);

const flags = {};
list.forEach((commandName) => {
  flags[commandName] = commands[commandName].flags.reduce(function (
    flags,
    flag
  ) {
    flags[flag] = true;
    return flags;
  },
  {});
});

/**
 * Check if the command exists
 */
export function exists(commandName: string): boolean {
  return Boolean(commands[commandName]);
}

/**
 * Check if the command has the flag
 *
 * Some of possible flags: readonly, noscript, loading
 */
export function hasFlag(commandName: string, flag: string): boolean {
  if (!flags[commandName]) {
    throw new Error("Unknown command " + commandName);
  }

  return Boolean(flags[commandName][flag]);
}

/**
 * Get indexes of keys in the command arguments
 *
 * @example
 * ```javascript
 * getKeyIndexes('set', ['key', 'value']) // [0]
 * getKeyIndexes('mget', ['key1', 'key2']) // [0, 1]
 * ```
 */
export function getKeyIndexes(
  commandName: string,
  args: (string | Buffer | number)[],
  options?: { parseExternalKey: boolean }
): number[] {
  const command = commands[commandName];
  if (!command) {
    throw new Error("Unknown command " + commandName);
  }

  if (!Array.isArray(args)) {
    throw new Error("Expect args to be an array");
  }

  const keys = [];
  const parseExternalKey = Boolean(options && options.parseExternalKey);

  switch (commandName) {
    case "zunionstore":
    case "zinterstore":
      keys.push(0);
    // fall through
    case "eval":
    case "evalsha":
    case "eval_ro":
    case "evalsha_ro":
    case "fcall":
    case "fcall_ro":
      const keyStop = Number(args[1]) + 2;
      for (let i = 2; i < keyStop; i++) {
        keys.push(i);
      }
      break;
    case "sort":
      keys.push(0);
      for (let i = 1; i < args.length - 1; i++) {
        let arg = args[i];
        if (typeof arg !== "string") {
          continue;
        }
        const directive = arg.toUpperCase();
        if (directive === "GET") {
          i += 1;
          arg = args[i];
          if (arg !== "#") {
            if (parseExternalKey) {
              keys.push([i, getExternalKeyNameLength(arg)]);
            } else {
              keys.push(i);
            }
          }
        } else if (directive === "BY") {
          i += 1;
          if (parseExternalKey) {
            keys.push([i, getExternalKeyNameLength(args[i])]);
          } else {
            keys.push(i);
          }
        } else if (directive === "STORE") {
          i += 1;
          keys.push(i);
        }
      }
      break;
    case "migrate":
      if (args[2] === "") {
        for (let i = 5; i < args.length - 1; i++) {
          const arg = args[i];
          if (typeof arg === "string" && arg.toUpperCase() === "KEYS") {
            for (let j = i + 1; j < args.length; j++) {
              keys.push(j);
            }
            break;
          }
        }
      } else {
        keys.push(2);
      }
      break;
    case "xreadgroup":
    case "xread":
      // Keys are 1st half of the args after STREAMS argument.
      for (let i = commandName === "xread" ? 0 : 3; i < args.length - 1; i++) {
        if (String(args[i]).toUpperCase() === "STREAMS") {
          for (let j = i + 1; j <= i + (args.length - 1 - i) / 2; j++) {
            keys.push(j);
          }
          break;
        }
      }
      break;
    default:
      // Step has to be at least one in this case, otherwise the command does
      // not contain a key.
      if (command.step > 0) {
        const keyStart = command.keyStart - 1;
        const keyStop =
          command.keyStop > 0
            ? command.keyStop
            : args.length + command.keyStop + 1;
        for (let i = keyStart; i < keyStop; i += command.step) {
          keys.push(i);
        }
      }
      break;
  }

  return keys;
}

function getExternalKeyNameLength(key: string | Buffer | number) {
  if (typeof key !== "string") {
    key = String(key);
  }
  const hashPos = key.indexOf("->");
  return hashPos === -1 ? key.length : hashPos;
}
