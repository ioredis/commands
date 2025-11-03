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
export function exists(
  commandName: string,
  options?: { caseInsensitive?: boolean }
): boolean {
  commandName = options?.caseInsensitive
    ? String(commandName).toLowerCase()
    : commandName;

  return Boolean(commands[commandName]);
}

/**
 * Check if the command has the flag
 *
 * Some of possible flags: readonly, noscript, loading
 */
export function hasFlag(
  commandName: string,
  flag: string,
  options?: { nameCaseInsensitive?: boolean }
): boolean {
  commandName = options?.nameCaseInsensitive
    ? String(commandName).toLowerCase()
    : commandName;

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
  options?: { parseExternalKey?: boolean; nameCaseInsensitive?: boolean }
): number[] {
  commandName = options?.nameCaseInsensitive
    ? String(commandName).toLowerCase()
    : commandName;

  const command = commands[commandName];
  if (!command) {
    throw new Error("Unknown command " + commandName);
  }

  if (!Array.isArray(args)) {
    throw new Error("Expect args to be an array");
  }

  const keys = [];
  const parseExternalKey = Boolean(options && options.parseExternalKey);

  const takeDynamicKeys = (args: unknown[], startIndex: number) => {
    const keys: number[] = [];
    const keyStop = Number(args[startIndex]);
    for (let i = 0; i < keyStop; i++) {
      keys.push(i + startIndex + 1);
    }
    return keys;
  };

  const takeKeyAfterToken = (
    args: unknown[],
    startIndex: number,
    token: string
  ) => {
    for (let i = startIndex; i < args.length - 1; i += 1) {
      if (String(args[i]).toLowerCase() === token.toLowerCase()) {
        return i + 1;
      }
    }
    return null;
  };

  switch (commandName) {
    case "zunionstore":
    case "zinterstore":
    case "zdiffstore":
      keys.push(0, ...takeDynamicKeys(args, 1));
      break;
    case "eval":
    case "evalsha":
    case "eval_ro":
    case "evalsha_ro":
    case "fcall":
    case "fcall_ro":
    case "blmpop":
    case "bzmpop":
      keys.push(...takeDynamicKeys(args, 1));
      break;
    case "sintercard":
    case "lmpop":
    case "zunion":
    case "zinter":
    case "zmpop":
    case "zintercard":
    case "zdiff": {
      keys.push(...takeDynamicKeys(args, 0));
      break;
    }
    case "georadius": {
      keys.push(0);
      const storeKey = takeKeyAfterToken(args, 5, "STORE");
      if (storeKey) keys.push(storeKey);
      const distKey = takeKeyAfterToken(args, 5, "STOREDIST");
      if (distKey) keys.push(distKey);
      break;
    }
    case "georadiusbymember": {
      keys.push(0);
      const storeKey = takeKeyAfterToken(args, 4, "STORE");
      if (storeKey) keys.push(storeKey);
      const distKey = takeKeyAfterToken(args, 4, "STOREDIST");
      if (distKey) keys.push(distKey);
      break;
    }
    case "sort":
    case "sort_ro":
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
