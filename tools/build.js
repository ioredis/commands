const moduleCommandPatterns = [
  '_ft.*',
  'bf.*',
  'cf.*',
  'cms.*',
  'ft.*',
  'json.*',
  'search.*',
  'tdigest.*',
  'timeseries.*',
  'topk.*',
  'ts.*'
]

function getTipValue (tips, name) {
  const prefix = `${name}:`
  const tip = tips.find(function (tip) {
    return String(tip).startsWith(prefix)
  })
  return tip === undefined ? undefined : String(tip).slice(prefix.length)
}

function isModuleCommand (commandName) {
  const normalizedCommandName = String(commandName).toLowerCase()
  return moduleCommandPatterns.some(function (pattern) {
    return normalizedCommandName.startsWith(pattern.slice(0, -1))
  })
}

function getCommandMetadata (command) {
  const arity = command[1]
  const flags = command[2]
  const keyStart = command[3]
  const keyStop = command[4]
  const step = command[5]
  const tips = command[7] || []
  const subcommands = command[9] || []
  const metadata = {
    arity: arity || 1, // https://github.com/antirez/redis/pull/2986
    flags,
    keyStart,
    keyStop,
    step
  }
  const requestPolicy = getTipValue(tips, 'request_policy')
  const responsePolicy = getTipValue(tips, 'response_policy')

  if (requestPolicy !== undefined) {
    metadata.requestPolicy = requestPolicy
  }
  if (responsePolicy !== undefined) {
    metadata.responsePolicy = responsePolicy
  }

  if (subcommands.length > 0) {
    metadata.subcommands = subcommands.reduce(function (prev, subcommand) {
      const fullName = String(subcommand[0]).toLowerCase()
      const subcommandName = fullName.slice(fullName.lastIndexOf('|') + 1)
      prev[subcommandName] = getCommandMetadata(subcommand)
      return prev
    }, {})
  }

  return metadata
}

function normalizeCommands (response, getKeyIndexes) {
  const getKeyIndexesSource = String(getKeyIndexes)
  const commands = response.reduce(function (prev, command) {
    const [rawCommandName, , flags] = command
    const commandName = String(rawCommandName).toLowerCase()
    if (isModuleCommand(commandName)) {
      return prev
    }

    const handled =
      getKeyIndexesSource.includes(`"${commandName}"`) ||
      getKeyIndexesSource.includes(`'${commandName}'`)
    const isMovableKey = flags.includes('movablekeys')
    if (isMovableKey && !handled) {
      throw new Error(`Unhandled movable command: ${commandName}`)
    }
    if (!isMovableKey && handled) {
      throw new Error(`Handled non-movable command: ${commandName}`)
    }
    const metadata = getCommandMetadata(command)

    // https://github.com/antirez/redis/issues/2598
    if (commandName === 'brpop' && metadata.keyStop === 1) {
      metadata.keyStop = -2
    }
    prev[commandName] = metadata
    return prev
  },
  {})

  // Future proof. Redis might implement this at some point
  // https://github.com/antirez/redis/pull/2982
  if (!commands.quit) {
    commands.quit = {
      arity: 1,
      flags: ['loading', 'stale', 'readonly'],
      keyStart: 0,
      keyStop: 0,
      step: 0
    }
  }

  return commands
}

async function main () {
  const fs = require('fs')
  const path = require('path')
  const stringify = require('safe-stable-stringify')
  const redisCommands = require('..')
  const Redis = require('ioredis')
  const redis = new Redis(process.env.REDIS_URI)

  try {
    const response = await redis.command()
    const commands = normalizeCommands(response, redisCommands.getKeyIndexes)
    const commandPath = path.join(__dirname, '..', 'lib', 'commands.json')

    // Use safe-stable-stringify instead fo JSON.stringify
    // for easier diffing
    const content = stringify(commands, null, '  ')

    fs.writeFileSync(commandPath, content)
  } finally {
    redis.disconnect()
  }
}

module.exports = {
  getCommandMetadata,
  getTipValue,
  isModuleCommand,
  normalizeCommands
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(error)
    process.exitCode = 1
  })
}
