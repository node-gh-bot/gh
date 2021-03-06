const { execSync } = require('child_process')
const { upperFirst } = require('lodash')

exports.runCmd = function runCmd(cmd) {
    try {
        var result = execSync(cmd, { cwd: process.cwd() })
    } catch (error) {
        throw new Error(error.output.toString())
    }

    return result.toString()
}

function formatCmdName(cmd, argv) {
    if (argv.length === 1) {
        return cmd.name
    }

    return cmd.flags.reduce((flagName, current) => {
        if (flagName) {
            return flagName
        }

        if (argv.includes(current)) {
            return `${cmd.name}${upperFirst(current.slice(2))}`
        }
    }, undefined)
}

exports.prepareTestFixtures = function prepareTestFixtures(cmdName, argv) {
    const nockBack = require('nock').back
    const { isArray, isPlainObject, map, mapValues } = require('lodash')
    let id = 0
    let newCmdName = null

    nockBack.setMode('record')

    const cmds = [
        {
            name: 'Issue',
            flags: ['--comment', '--new', '--open', '--close', '--search', '--assign'],
        },
    ]

    cmds.forEach(cmd => formatCmdName(cmd, argv))

    if (cmdName === 'Issue') {
        if (argv.length === 1) {
            newCmdName = 'Issue'
        } else if (argv.includes('--comment')) {
            newCmdName = 'IssueComment'
        } else if (argv.includes('--new')) {
            newCmdName = 'IssueNew'
        } else if (argv.includes('--open')) {
            newCmdName = 'IssueOpen'
        } else if (argv.includes('--close')) {
            newCmdName = 'IssueClose'
        } else if (argv.includes('--search')) {
            newCmdName = 'IssueSearch'
        } else if (argv.includes('--assign')) {
            newCmdName = 'IssueAssign'
        }
    }

    nockBack.fixtures = `${process.cwd()}/__tests__/nockFixtures`

    const nockPromise = nockBack(`${newCmdName}.json`, {
        before,
        afterRecord,
    })

    return () => nockPromise.then(({ nockDone }) => nockDone())

    /* --- Normalization Functions --- */

    function normalize(value, key) {
        if (isPlainObject(value)) {
            return mapValues(value, normalize)
        }

        if (isArray(value) && isPlainObject(value[0])) {
            return map(value, normalize)
        }

        if (key.includes('_at')) {
            return '2017-10-10T16:00:00Z'
        }

        if (key.includes('_count')) {
            return 42
        }

        if (key.includes('id')) {
            return 1000 + id++
        }

        if (key.includes('node_id')) {
            return 'MDA6RW50aXR5MQ=='
        }

        if (key.includes('url')) {
            return value.replace(/[1-9][0-9]{2,10}/, '000000001')
        }

        return value
    }

    function afterRecord(fixtures) {
        const normalizedFixtures = fixtures.map(fixture => {
            delete fixture.rawHeaders

            fixture.path = stripAccessToken(fixture.path)

            if (isArray(fixture.response)) {
                fixture.response = fixture.response.slice(0, 3).map(res => {
                    return mapValues(res, normalize)
                })
            } else {
                fixture.response = mapValues(fixture.response, normalize)
            }

            return fixture
        })

        return normalizedFixtures
    }

    function stripAccessToken(path) {
        return path.replace(/access_token(.*?)(&|$)/, '')
    }

    function before(scope) {
        scope.filteringPath = () => stripAccessToken(scope.path)
    }
}
