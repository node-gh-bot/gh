/**
 * © 2013 Liferay, Inc. <https://liferay.com> and Node GH contributors
 * (see file: CONTRIBUTORS)
 * SPDX-License-Identifier: BSD-3-Clause
 */

// -- Requires -------------------------------------------------------------------------------------

import { isArray } from 'lodash'
import * as openUrl from 'opn'
import * as base from '../base'
import * as hooks from '../hooks'
import * as logger from '../logger'

const config = base.getConfig()
const testing = process.env.NODE_ENV === 'testing'

// -- Constructor ----------------------------------------------------------------------------------

export default function Issue(options) {
    this.options = options

    if (!options.repo && !options.all) {
        logger.error('You must specify a Git repository with a GitHub remote to run this command')
    }
}

// -- Constants ------------------------------------------------------------------------------------

Issue.DETAILS = {
    alias: 'is',
    description: 'Provides a set of util commands to work with Issues.',
    iterative: 'number',
    commands: ['assign', 'browser', 'close', 'comment', 'list', 'new', 'open', 'search'],
    options: {
        all: Boolean,
        assign: Boolean,
        assignee: String,
        browser: Boolean,
        close: Boolean,
        comment: String,
        date: String,
        detailed: Boolean,
        label: String,
        list: Boolean,
        link: Boolean,
        message: String,
        milestone: [Number, String],
        'no-milestone': Boolean,
        new: Boolean,
        number: [String, Array],
        open: Boolean,
        remote: String,
        repo: String,
        search: String,
        state: ['open', 'closed'],
        title: String,
        user: String,
    },
    shorthands: {
        a: ['--all'],
        A: ['--assignee'],
        B: ['--browser'],
        C: ['--close'],
        c: ['--comment'],
        d: ['--detailed'],
        L: ['--label'],
        k: ['--link'],
        l: ['--list'],
        m: ['--message'],
        M: ['--milestone'],
        N: ['--new'],
        n: ['--number'],
        o: ['--open'],
        r: ['--repo'],
        s: ['--search'],
        S: ['--state'],
        t: ['--title'],
        u: ['--user'],
    },
    payload(payload, options) {
        if (payload[0]) {
            if (/^\d+$/.test(payload[0])) {
                options.browser = true
                options.number = payload[0]
                return
            }

            options.new = true
            options.title = options.title || payload[0]
            options.message = options.message || payload[1]
        } else {
            options.list = true
        }
    },
}

Issue.STATE_CLOSED = 'closed'
Issue.STATE_OPEN = 'open'

// -- Commands -------------------------------------------------------------------------------------

Issue.prototype.run = async function(done) {
    const instance = this
    const options = instance.options
    const userRepo = logger.colors.green(`${options.user}/${options.repo}`)
    const number = logger.colors.green(`#${options.number}`)

    instance.config = config

    options.state = options.state || Issue.STATE_OPEN

    if (options.assign) {
        hooks.invoke('issue.assign', instance, async afterHooksCallback => {
            logger.log(
                `Assigning issue ${number} on ${userRepo} to ${logger.colors.magenta(
                    options.assignee
                )}`
            )

            try {
                var { data } = await instance.assign()
            } catch (err) {
                throw new Error(`Can't assign issue.\n${err}`)
            }

            logger.log(logger.colors.cyan(data.html_url))

            afterHooksCallback()

            done && done()
        })
    }

    if (options.browser) {
        !testing && instance.browser(options.user, options.repo, options.number)
    }

    if (options.close) {
        hooks.invoke('issue.close', instance, async afterHooksCallback => {
            options.state = Issue.STATE_CLOSED

            logger.log(`Closing issue ${number} on ${userRepo}`)

            try {
                var { data } = await instance.close()
            } catch (err) {
                throw new Error(`Can't close issue.\n${err}`)
            }

            logger.log(logger.colors.cyan(data.html_url))

            afterHooksCallback()

            done && done()
        })
    }

    if (options.comment) {
        logger.log(`Adding comment on issue ${number} on ${userRepo}`)

        try {
            var { data } = await instance.comment()
        } catch (err) {
            throw new Error(`Can't add comment.\n${err}`)
        }

        logger.log(logger.colors.cyan(data.html_url))

        done && done()
    }

    if (options.list) {
        try {
            if (options.all) {
                logger.log(
                    `Listing ${logger.colors.green(options.state)} issues for ${logger.colors.green(
                        options.user
                    )}`
                )

                await instance.listFromAllRepositories()
            } else {
                logger.log(`Listing ${logger.colors.green(options.state)} issues on ${userRepo}`)

                await instance.list(options.user, options.repo)
            }
        } catch (err) {
            throw new Error(`Error listing issues\n${err}`)
        }

        done && done()
    }

    if (options.new) {
        hooks.invoke('issue.new', instance, async afterHooksCallback => {
            logger.log(`Creating a new issue on ${userRepo}`)

            try {
                var { data } = await instance.new()
            } catch (err) {
                throw new Error(`Can't create issue.\n${err}`)
            }

            if (data) {
                options.number = data.number
            }

            logger.log(data.html_url)

            afterHooksCallback()

            done && done()
        })
    }

    if (options.open) {
        hooks.invoke('issue.open', instance, async afterHooksCallback => {
            logger.log(`Opening issue ${number} on ${userRepo}`)

            try {
                var { data } = await instance.open()
            } catch (err) {
                throw new Error(`Can't close issue.\n${err}`)
            }

            logger.log(data.html_url)

            afterHooksCallback()

            done && done()
        })
    }

    if (options.search) {
        let { repo, user } = options
        const query = logger.colors.green(options.search)

        if (options.all) {
            repo = undefined

            logger.log(`Searching for ${query} in issues for ${logger.colors.green(user)}\n`)
        } else {
            logger.log(`Searching for ${query} in issues for ${userRepo}\n`)
        }

        try {
            await instance.search(user, repo)
        } catch (err) {
            throw new Error(`Can't search issues for ${userRepo}: \n${err}`)
        }

        done && done()
    }
}

Issue.prototype.assign = async function() {
    const instance = this

    const issue = await instance.getIssue_()

    return await instance.editIssue_(issue.title, Issue.STATE_OPEN)
}

Issue.prototype.browser = function(user, repo, number) {
    if (!number) {
        number = ''
    }

    openUrl(`${config.github_host}/${user}/${repo}/issues/${number}`, { wait: false })
}

Issue.prototype.close = async function() {
    var instance = this

    const issue = await instance.getIssue_()

    return await instance.editIssue_(issue.title, Issue.STATE_CLOSED)
}

Issue.prototype.comment = async function() {
    const instance = this
    let options = instance.options
    let body
    let payload

    body = logger.applyReplacements(options.comment, config.replace) + config.signature

    payload = {
        body,
        number: options.number,
        repo: options.repo,
        owner: options.user,
    }

    return await base.github.issues.createComment(payload)
}

Issue.prototype.editIssue_ = async function(title, state) {
    const instance = this
    const options = instance.options
    let payload

    options.label = options.label || []

    payload = {
        state,
        title,
        assignee: options.assignee,
        labels: options.label,
        milestone: options.milestone,
        number: options.number,
        owner: options.user,
        repo: options.repo,
    }

    return await base.github.issues.update(payload)
}

Issue.prototype.getIssue_ = async function() {
    const instance = this
    const options = instance.options
    let payload

    payload = {
        number: options.number,
        repo: options.repo,
        owner: options.user,
    }

    return await base.github.issues.get(payload)
}

Issue.prototype.list = async function(user, repo) {
    const instance = this
    const options = instance.options
    let payload

    payload = {
        repo,
        owner: user,
        state: options.state,
    }

    if (options.label) {
        payload.label = options.label
    }

    if (options['no-milestone']) {
        payload.milestone = 'none'
    }

    if (options.milestone) {
        const milestones = await base.github.issues.listMilestonesForRepo({
            repo,
            owner: user,
        })

        const milestoneNumber = milestones.data
            .filter(milestone => options.milestone === milestone.title)
            .map(milestone => milestone.number)[0]

        payload.milestone = `${milestoneNumber}`
    }

    if (options.assignee) {
        payload.assignee = options.assignee
    }

    const { data } = await base.github.issues.listForRepo(payload)

    const issues = data.filter(result => Boolean(result))

    if (issues && issues.length > 0) {
        const formattedIssues = formatIssues(issues, options.detailed)

        logger.log(formattedIssues)
    } else {
        logger.log('No issues.')
    }
}

Issue.prototype.listFromAllRepositories = async function() {
    const instance = this
    const options = instance.options
    let payload

    payload = {
        type: 'all',
        username: options.user,
    }

    const repositories: any = await base.github.repos.listForUser(payload)

    for (const repo of repositories.data) {
        await instance.list(repo.owner.login, repo.name)
    }
}

Issue.prototype.new = async function() {
    const instance = this
    const options = instance.options
    let body

    if (options.message) {
        body = logger.applyReplacements(options.message, config.replace)
    }

    if (options.label) {
        options.label = options.label.split(',')
    } else {
        options.label = []
    }

    const payload = {
        body,
        assignee: options.assignee,
        repo: options.repo,
        title: options.title,
        owner: options.user,
        labels: options.label,
    }

    return await base.github.issues.create(payload)
}

Issue.prototype.open = async function() {
    var instance = this

    const issue = await instance.getIssue_()

    return await instance.editIssue_(issue.title, Issue.STATE_OPEN)
}

Issue.prototype.search = async function(user, repo) {
    const instance = this
    const options = instance.options
    let query = ['type:issue']
    let payload

    options.label = options.label || ''

    if (!options.all && repo) {
        query.push(`repo:${repo}`)
    }

    if (user) {
        query.push(`user:${user}`)
    }

    query.push(options.search)

    payload = {
        q: query.join(' '),
        type: 'Issues',
    }

    const { data } = await base.github.search.issues(payload)

    if (data.items && data.items.length > 0) {
        const formattedIssues = formatIssues(data.items, options.detailed)

        logger.log(formattedIssues)
    } else {
        logger.log('Could not find any issues matching your query.')
    }
}

function formatIssues(issues, showDetailed, dateFormatter?: string) {
    issues.sort((a, b) => {
        return a.number > b.number ? -1 : 1
    })

    if (issues && issues.length > 0) {
        const formattedIssuesArr = issues.map(issue => {
            const issueNumber = logger.colors.green(`#${issue.number}`)
            const issueUser = logger.colors.magenta(`@${issue.user.login}`)
            const issueDate = `(${logger.getDuration(issue.created_at, dateFormatter)})`

            let formattedIssue = `${issueNumber} ${issue.title} ${issueUser} ${issueDate}`

            if (showDetailed) {
                if (issue.body) {
                    formattedIssue = `
                        ${formattedIssue}
                        ${issue.body}
                    `
                }

                if (isArray(issue.labels) && issue.labels.length > 0) {
                    const labels = issue.labels.map(label => label.name)
                    const labelHeading = labels.length > 1 ? 'labels: ' : 'label: '

                    formattedIssue = `
                        ${formattedIssue}
                        ${logger.colors.yellow(labelHeading) + labels.join(', ')}
                    `
                }

                if (issue.milestone) {
                    const { number, title } = issue.milestone

                    formattedIssue = `
                        ${formattedIssue}
                        ${`${logger.colors.green('milestone: ')} ${title} - ${number}`}
                    `
                }

                formattedIssue = `
                    ${formattedIssue}
                    ${logger.colors.blue(issue.html_url)}
                `
            }

            return trim(formattedIssue)
        })

        return formattedIssuesArr.join('\n\n')
    }

    return null
}

function trim(str) {
    return str
        .replace(/^[ ]+/gm, '')
        .replace(/[\r\n]+/g, '\n')
        .trim()
}
