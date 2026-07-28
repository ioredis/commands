'use strict'

/* global describe, it */

const { expect } = require('chai')
const {
  getCommandMetadata,
  getTipValue,
  isModuleCommand,
  normalizeCommands
} = require('../tools/build')

function command (
  name,
  {
    arity = -2,
    flags = [],
    keyStart = 0,
    keyStop = 0,
    step = 0,
    tips = [],
    subcommands = []
  } = {}
) {
  return [
    name,
    arity,
    flags,
    keyStart,
    keyStop,
    step,
    [],
    tips,
    [],
    subcommands
  ]
}

describe('command metadata generation', () => {
  it('extracts named tips', () => {
    const tips = [
      'nondeterministic_output',
      'request_policy:all_shards',
      'response_policy:agg_sum'
    ]

    expect(getTipValue(tips, 'request_policy')).to.eql('all_shards')
    expect(getTipValue(tips, 'response_policy')).to.eql('agg_sum')
    expect(getTipValue(tips, 'missing')).to.eql(undefined)
  })

  it('recursively normalizes subcommands and policies', () => {
    const leaf = command('PARENT|CHILD|LEAF', {
      arity: 4,
      flags: ['readonly'],
      keyStart: 3,
      keyStop: 3,
      step: 1,
      tips: ['response_policy:agg_sum']
    })
    const child = command('PARENT|CHILD', {
      tips: ['request_policy:all_nodes'],
      subcommands: [leaf]
    })
    const parent = command('PARENT', { subcommands: [child] })

    expect(getCommandMetadata(parent)).to.eql({
      arity: -2,
      flags: [],
      keyStart: 0,
      keyStop: 0,
      step: 0,
      subcommands: {
        child: {
          arity: -2,
          flags: [],
          keyStart: 0,
          keyStop: 0,
          step: 0,
          requestPolicy: 'all_nodes',
          subcommands: {
            leaf: {
              arity: 4,
              flags: ['readonly'],
              keyStart: 3,
              keyStop: 3,
              step: 1,
              responsePolicy: 'agg_sum'
            }
          }
        }
      }
    })
  })

  it('supports legacy command responses without tips or subcommands', () => {
    expect(getCommandMetadata(['GET', 2, ['readonly'], 1, 1, 1])).to.eql({
      arity: 2,
      flags: ['readonly'],
      keyStart: 1,
      keyStop: 1,
      step: 1
    })
  })

  it('identifies module command namespaces case-insensitively', () => {
    const moduleCommands = [
      '_FT.CONFIG',
      'BF.ADD',
      'CF.ADD',
      'CMS.QUERY',
      'FT.SEARCH',
      'JSON.GET',
      'SEARCH.CLUSTERINFO',
      'TDIGEST.ADD',
      'TIMESERIES.CLUSTERSET',
      'TOPK.ADD',
      'TS.ADD'
    ]

    moduleCommands.forEach(function (commandName) {
      expect(isModuleCommand(commandName)).to.eql(true)
    })
    expect(isModuleCommand('VADD')).to.eql(false)
  })

  it('filters module commands without filtering core module-flagged commands', () => {
    const response = [
      command('JSON.GET', { flags: ['readonly', 'module'] }),
      command('VADD', { flags: ['write', 'module'] })
    ]
    const commands = normalizeCommands(response, function getKeyIndexes () {})

    expect(commands).to.have.property('vadd')
    expect(commands).not.to.have.property('json.get')
  })

  it('validates movable command handling', () => {
    const movable = command('CUSTOMMOVE', {
      flags: ['write', 'movablekeys']
    })
    const nonMovable = command('CUSTOMMOVE', { flags: ['write'] })

    function getKeyIndexes (commandName) {
      if (commandName === 'custommove') {
        return []
      }
    }

    expect(() => {
      normalizeCommands([movable], function getKeyIndexes () {})
    }).to.throw('Unhandled movable command: custommove')
    expect(() => {
      normalizeCommands([nonMovable], getKeyIndexes)
    }).to.throw('Handled non-movable command: custommove')
    expect(normalizeCommands([movable], getKeyIndexes)).to.have.property(
      'custommove'
    )
  })

  it('applies compatibility metadata and adds quit when absent', () => {
    const commands = normalizeCommands(
      [command('BRPOP', { keyStart: 1, keyStop: 1, step: 1 })],
      function getKeyIndexes () {}
    )

    expect(commands.brpop.keyStop).to.eql(-2)
    expect(commands.quit).to.eql({
      arity: 1,
      flags: ['loading', 'stale', 'readonly'],
      keyStart: 0,
      keyStop: 0,
      step: 0
    })
  })
})
