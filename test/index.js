'use strict'

/* global describe, it */

const commands = require('..')
const { expect } = require('chai')

describe('redis-commands', () => {
  describe('.list', () => {
    it('should be an array', () => {
      expect(commands.list).to.be.instanceof(Array)
    })

    it('should ensure every command is lowercase', () => {
      commands.list.forEach(function (command) {
        expect(command.toLowerCase()).to.eql(command)
      })
    })

    it('should ensure quit command is added to the commands list', () => {
      expect(commands.list.indexOf('quit')).not.to.eql(-1)
    })

    it('should not contain multi-word commands', () => {
      commands.list.forEach(function (command) {
        expect(command.indexOf(' ')).to.eql(-1)
      })
    })
  })

  describe('.exists()', () => {
    it('should return true for existing commands', () => {
      expect(commands.exists('set')).to.eql(true)
      expect(commands.exists('get')).to.eql(true)
      expect(commands.exists('cluster')).to.eql(true)
      expect(commands.exists('quit')).to.eql(true)
      expect(commands.exists('config')).to.eql(true)
    })

    it('should return false for non-existing commands', () => {
      expect(commands.exists('SET')).to.eql(false)
      expect(commands.exists('set get')).to.eql(false)
      expect(commands.exists('other-command')).to.eql(false)
    })

    it('supports case-insensitive lookups when enabled', () => {
      expect(commands.exists('SET', { caseInsensitive: true })).to.eql(true)
      expect(commands.exists('SeT', { caseInsensitive: true })).to.eql(true)
      expect(commands.exists('SET')).to.eql(false)
    })
  })

  describe('.hasFlag()', () => {
    it('should return true if the command has the flag', () => {
      expect(commands.hasFlag('set', 'write')).to.eql(true)
      expect(commands.hasFlag('set', 'denyoom')).to.eql(true)
      expect(commands.hasFlag('select', 'fast')).to.eql(true)
    })

    it('should return false otherwise', () => {
      expect(commands.hasFlag('set', 'fast')).to.eql(false)
      expect(commands.hasFlag('set', 'readonly')).to.eql(false)
      expect(commands.hasFlag('select', 'denyoom')).to.eql(false)
      expect(commands.hasFlag('quit', 'denyoom')).to.eql(false)
    })

    it('should throw on unknown commands', () => {
      expect(() => {
        commands.hasFlag('UNKNOWN')
      }).to.throw(Error)
    })

    it('supports case-insensitive command name when enabled', () => {
      expect(commands.hasFlag('SET', 'write', { nameCaseInsensitive: true })).to.eql(true)
      expect(commands.hasFlag('SeLeCt', 'fast', { nameCaseInsensitive: true })).to.eql(true)
      expect(commands.hasFlag('SeT', 'readonly', { nameCaseInsensitive: true })).to.eql(false)
    })
  })

  describe('.getKeyIndexes()', () => {
    const index = commands.getKeyIndexes

    it('should throw on unknown commands', () => {
      expect(() => {
        index('UNKNOWN')
      }).to.throw(Error)
    })

    it('should throw on faulty args', () => {
      expect(() => {
        index('get', 'foo')
      }).to.throw(Error)
    })

    it('should return an empty array if no keys exist', () => {
      expect(index('auth', [])).to.eql([])
    })

    it('should return key indexes', () => {
      expect(index('set', ['foo', 'bar'])).to.eql([0])
      expect(index('zdiff', ['2', 'foo', 'bar'])).to.eql([1, 2])
      expect(index('del', ['foo'])).to.eql([0])
      expect(index('get', ['foo'])).to.eql([0])
      expect(index('mget', ['foo', 'bar'])).to.eql([0, 1])
      expect(index('mset', ['foo', 'v1', 'bar', 'v2'])).to.eql([0, 2])
      expect(index('hmset', ['key', 'foo', 'v1', 'bar', 'v2'])).to.eql([0])
      expect(index('blpop', ['key1', 'key2', '17'])).to.eql([0, 1])
      expect(index('lpop', ['key', 'COUNT', '17'])).to.eql([0])
      expect(index('evalsha', ['23123', '2', 'foo', 'bar', 'zoo'])).to.eql([
        2, 3
      ])
      expect(index('sort', ['key'])).to.eql([0])
      expect(
        index('zunionstore', [
          'out',
          '2',
          'zset1',
          'zset2',
          'WEIGHTS',
          '2',
          '3'
        ])
      ).to.eql([0, 2, 3])
    })

    it('supports case-insensitive command name when enabled', () => {
      // default behavior: unknown uppercased command should throw
      expect(() => index('GET', ['foo'])).to.throw(Error)
      // with nameCaseInsensitive, it should work
      expect(index('GET', ['foo'], { nameCaseInsensitive: true })).to.eql([0])
      // also test a command handled in the switch branches
      expect(index('EVAL', ['script', '2', 'k1', 'k2'], { nameCaseInsensitive: true })).to.eql([2, 3])
    })

    describe('moveable commands', () => {
      it('handles zunionstore', () => {
        expect(
          index('zunionstore', [
            'out',
            '2',
            'zset1',
            'zset2',
            'WEIGHTS',
            '2',
            '3'
          ])
        ).to.eql([0, 2, 3])
      })

      it('handles zinterstore', () => {
        expect(
          index('zinterstore', [
            'out',
            '2',
            'zset1',
            'zset2',
            'WEIGHTS',
            '2',
            '3'
          ])
        ).to.eql([0, 2, 3])
      })

      it('handles zdiffstore', () => {
        expect(index('zdiffstore', ['out', '2', 'zset1', 'zset2'])).to.eql([
          0, 2, 3
        ])
      })

      it('handles eval', () => {
        expect(index('eval', ['script', '0', 'foo'])).to.eql([])
        expect(index('eval_ro', ['script', '0'])).to.eql([])
        expect(index('eval', ['script', '3', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3, 4
        ])
        expect(index('eval', ['script', '2', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3
        ])
        expect(index('evalsha', ['script', '3', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3, 4
        ])
        expect(index('evalsha_ro', ['script', 1, 'foo', 'bar'])).to.eql([2])
      })

      it('handles fcall', () => {
        expect(index('fcall', ['function', '0', 'foo'])).to.eql([])
        expect(index('fcall_ro', ['function', '0'])).to.eql([])
        expect(index('fcall', ['function', '3', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3, 4
        ])
        expect(index('fcall', ['function', '2', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3
        ])
      })

      it('handles blmpop', () => {
        expect(index('blmpop', ['0', '1', 'foo', 'left'])).to.eql([2])
        expect(
          index('blmpop', ['0', '2', 'foo', 'bar', 'right', 'count', 10])
        ).to.eql([2, 3])
      })

      it('handles bzmpop', () => {
        expect(index('bzmpop', ['0', '1', 'foo', 'min'])).to.eql([2])
        expect(
          index('bzmpop', ['0', '2', 'foo', 'bar', 'max', 'count', 10])
        ).to.eql([2, 3])
      })

      it('handles sintercard & zintercard', () => {
        expect(index('sintercard', ['2', 'key1', 'key2', 'limit', '1'])).to.eql(
          [1, 2]
        )
        expect(index('sintercard', ['2', 'key1', 'key2'])).to.eql([1, 2])
        expect(index('zintercard', ['2', 'key1', 'key2'])).to.eql([1, 2])
      })

      it('handles lmpop', () => {
        expect(
          index('lmpop', ['2', 'key1', 'key2', 'left', 'count', 10])
        ).to.eql([1, 2])
      })

      it('handles zunion & zinter', () => {
        expect(index('zunion', ['2', 'key1', 'key2', 'WITHSCORES'])).to.eql([
          1, 2
        ])
        expect(index('zinter', ['2', 'key1', 'key2', 'WITHSCORES'])).to.eql([
          1, 2
        ])
      })

      it('handles zmpop', () => {
        expect(
          index('zmpop', ['2', 'key1', 'key2', 'MAX', 'COUNT', '10'])
        ).to.eql([1, 2])
      })

      it('handles zdiff', () => {
        expect(index('zdiff', ['2', 'key1', 'key2', 'WITHSCORES'])).to.eql([
          1, 2
        ])
      })

      it('handles georadius', () => {
        expect(
          index('georadius', [
            'Sicily',
            15,
            37,
            200,
            'km',
            'WITHDIST',
            'STORE',
            'store'
          ])
        ).to.eql([0, 7])

        expect(
          index('georadius', [
            'Sicily',
            15,
            37,
            200,
            'km',
            'WITHDIST',
            'STORE',
            'store1',
            'STOREDIST',
            'store2'
          ])
        ).to.eql([0, 7, 9])

        expect(
          index('georadius', ['Sicily', 15, 37, 200, 'km', 'WITHDIST'])
        ).to.eql([0])

        expect(
          index('georadius_ro', ['Sicily', 15, 37, 200, 'km', 'WITHDIST'])
        ).to.eql([0])
      })

      it('handles georadiusbymember', () => {
        expect(
          index('georadiusbymember', [
            'Sicily',
            'ag',
            200,
            'km',
            'STORE',
            'store'
          ])
        ).to.eql([0, 5])

        expect(
          index('georadiusbymember_ro', ['Sicily', 'ag', 200, 'km'])
        ).to.eql([0])
      })

      it('handles migrate', () => {
        expect(
          index('migrate', ['127.0.0.1', 6379, 'foo', 0, 0, 'COPY'])
        ).to.eql([2])
        expect(
          index('migrate', [
            '127.0.0.1',
            6379,
            '',
            0,
            0,
            'REPLACE',
            'KEYS',
            'foo',
            'bar'
          ])
        ).to.eql([7, 8])
        expect(
          index('migrate', ['127.0.0.1', 6379, '', 0, 0, 'KEYS', 'foo', 'bar'])
        ).to.eql([6, 7])
      })

      it('handles xreadgroup', () => {
        expect(
          index('xreadgroup', [
            'GROUP',
            'group',
            'consumer',
            'COUNT',
            10,
            'BLOCK',
            2000,
            'NOACK',
            'STREAMS',
            'key1',
            'key2',
            'id1',
            'id2'
          ])
        ).to.eql([9, 10])
        expect(
          index('xreadgroup', [
            'GROUP',
            'group',
            'consumer',
            'STREAMS',
            'key1',
            'id1'
          ])
        ).to.eql([4])
        expect(
          index('xreadgroup', [
            'GROUP',
            'group',
            'consumer',
            'STREAMS',
            'key1',
            'key2',
            'id1',
            'id2'
          ])
        ).to.eql([4, 5])
        expect(
          index('xreadgroup', [
            'GROUP',
            'group',
            'consumer',
            'STREAMS',
            'key1',
            'key2',
            'key3',
            'id1',
            'id2',
            'id3'
          ])
        ).to.eql([4, 5, 6])
      })

      it('handles xread', () => {
        expect(
          index('xread', [
            'COUNT',
            10,
            'BLOCK',
            2000,
            'STREAMS',
            'key1',
            'key2',
            'id1',
            'id2'
          ])
        ).to.eql([5, 6])
        expect(index('xread', ['STREAMS', 'key1', 'id1'])).to.eql([1])
        expect(
          index('xread', ['STREAMS', 'key1', 'key2', 'id1', 'id2'])
        ).to.eql([1, 2])
        expect(
          index('xread', [
            'STREAMS',
            'key1',
            'key2',
            'key3',
            'id1',
            'id2',
            'id3'
          ])
        ).to.eql([1, 2, 3])
      })
    })

    it('should support numeric argument', () => {
      expect(
        index('zinterstore', ['out', 2, 'zset1', 'zset2', 'WEIGHTS', 2, 3])
      ).to.eql([0, 2, 3])
    })

    describe('scripts/functions', () => {
      it('supports eval', () => {
        expect(index('eval', ['script', 2, 'foo', 'bar', 'zoo'])).to.eql([
          2, 3
        ])
        expect(index('eval_ro', ['script', '2', 'foo', 'bar', 'zoo'])).to.eql([
          2, 3
        ])
        expect(index('evalsha', ['sha', 1, 'foo', 'bar', 'zoo'])).to.eql([2])
        expect(index('evalsha_ro', ['sha', 0])).to.eql([])
      })

      it('supports fcall', () => {
        expect(index('fcall', ['myfunc', 2, 'foo', 'bar', 'zoo'])).to.eql([
          2, 3
        ])
        expect(index('fcall_ro', ['myfunc', 1, 'foo', 'bar', 'zoo'])).to.eql([
          2
        ])
      })
    })

    describe('disable parseExternalKey', () => {
      it('should not parse external keys', () => {
        expect(index('sort', ['key', 'BY', 'hash:*->field'])).to.eql([0, 2])
        expect(
          index('sort', [
            'key',
            'BY',
            'hash:*->field',
            'LIMIT',
            2,
            3,
            'GET',
            'gk',
            'GET',
            '#',
            'Get',
            'gh->f*',
            'DESC',
            'ALPHA',
            'STORE',
            'store'
          ])
        ).to.eql([0, 2, 7, 11, 15])
      })
    })

    describe('enable parseExternalKey', () => {
      it('should parse external keys', () => {
        expect(
          index('sort', ['key', 'BY', 'hash:*->field'], {
            parseExternalKey: true
          })
        ).to.eql([0, [2, 6]])
        expect(
          index(
            'sort',
            [
              'key',
              'BY',
              'hash:*->field',
              'LIMIT',
              2,
              3,
              'GET',
              Buffer.from('gk'),
              'GET',
              '#',
              'Get',
              'gh->f*',
              'DESC',
              'ALPHA',
              'STORE',
              'store'
            ],
            {
              parseExternalKey: true
            }
          )
        ).to.eql([0, [2, 6], [7, 2], [11, 2], 15])
      })
    })
  })
})
