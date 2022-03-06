const fs = require('fs')
const path = require('path')
const stringify = require('safe-stable-stringify')
const commandPath = path.join(__dirname, '..', 'commands.json')
const redisCommands = require('../')

const Redis = require('ioredis')
const redis = new Redis(process.env.REDIS_URI)

redis.command().then(function (res) {
  redis.disconnect()

  // Find all special handled cases
  const movableKeys = String(redisCommands.getKeyIndexes).match(/case '[a-z-]+':/g).map(function (entry) {
    return entry.replace(/^case '|':$/g, '')
  })

  const commands = res.reduce(function (prev, current) {
    const currentCommandPos = movableKeys.indexOf(current[0])
    if (currentCommandPos !== -1 && current[2].indexOf('movablekeys') !== -1) {
      movableKeys.splice(currentCommandPos, 1)
    }
    // https://github.com/antirez/redis/issues/2598
    if (current[0] === 'brpop' && current[4] === 1) {
      current[4] = -2
    }
    prev[current[0]] = {
      arity: current[1] || 1, // https://github.com/antirez/redis/pull/2986
      flags: current[2],
      keyStart: current[3],
      keyStop: current[4],
      step: current[5]
    }
    return prev
  }, {})

  // Future proof. Redis might implement this at some point
  // https://github.com/antirez/redis/pull/2982
  if (!commands.quit) {
    commands.quit = {
      arity: 1,
      flags: [
        'loading',
        'stale',
        'readonly'
      ],
      keyStart: 0,
      keyStop: 0,
      step: 0
    }
  }

  if (movableKeys.length !== 0) {
    throw new Error('Not all commands (\'' + movableKeys.join('\', \'') + '\') with the "movablekeys" flag are handled in the code')
  }

  // Use safe-stable-stringify instead fo JSON.stringify
  // for easier diffing
  const content = stringify(commands, null, '  ')

  fs.writeFileSync(commandPath, content)
})
