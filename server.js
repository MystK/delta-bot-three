/*
Corner Cases
Edited comments are not handled
*/
import 'colors'
import _ from 'lodash'
import promisify from 'promisify-node'
import Koa from 'koa'
import Router from 'koa-router'
import fs from 'fs'
import { stringify } from 'query-string'
import bodyParser from 'koa-bodyparser'
import Reddit from './RedditAPIDriver'
import DeltaBoardsThree from './delta-boards-three'
import i18n from './i18n'
import parseHiddenParams from './parse-hidden-params'
import getWikiContent from './get-wiki-content'

const isDebug = _.some(process.argv, arg => {
  return arg === '--debug'
})
if (isDebug) {
  console.log('server.js called!  running in debug mode')
}

const last = []
setInterval(() => {
  const now = Date.now()
  if (now < last[0] + 1800000 || now < last[1] + 1800000) process.exit(1)
}, 3600000)

const locale = 'en-us'
const app = new Koa()
const router = new Router()
fs.writeFile = promisify(fs.writeFile)
let state
let lastParsedCommentIDs
let lastParsedCommentID
try {
  state = require('./state.json')

  lastParsedCommentIDs = state.lastParsedCommentIDs
  lastParsedCommentID = lastParsedCommentIDs[0]
} catch (err) {
  console.log('No or curropted state.json file! Starting from no state!'.gray)
  state = {}
  lastParsedCommentIDs = []
  lastParsedCommentID = null
}
let credentials
try {
  credentials = require('./credentials')
} catch (err) {
  console.log('Missing credentials!'.red)
  console.log('Please contact the author for credentials or create your own credentials json!'.red)
  console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientID": "Your application ID",
  "clientSecret": "Your application secret",
  "subreddit": "Your subreddit to moderate"
}`.red)
}
const packageJson = require('./package.json')

const subreddit = credentials.subreddit
const botUsername = credentials.username
const flags = { isDebug }
const reddit = new Reddit(credentials, packageJson.version, './', flags)

const getNewComments = async (recursiveList) => {
  console.log('Making comments call!')
  const dirtyRecursiveList = recursiveList || []
  let query = {}
  if (lastParsedCommentID) {
    query = { after: lastParsedCommentID }
    let response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
    if (response.error) throw Error(response.error)
    while (!response.data.children.length && lastParsedCommentIDs.length) {
      lastParsedCommentID = lastParsedCommentIDs.shift()
      query = { after: lastParsedCommentID }
      response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
      if (response.error) throw Error(response.error)
    }
    lastParsedCommentIDs = []
    lastParsedCommentIDs.push(lastParsedCommentID)
    for (let i = 0; i < 4; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
    if (lastParsedCommentIDs.length === 0) {
      lastParsedCommentID = null
      await fs.writeFile('./state.json', '{}')

      const stateResponse = await reddit.query(`/r/${subreddit}/comments.json`, true)
      if (stateResponse.error) throw Error(stateResponse.error)
      for (let i = 0; i < 5; ++i) {
        lastParsedCommentIDs.push(_.get(stateResponse, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
      lastParsedCommentID = lastParsedCommentIDs[0]
    }
  }
  query = { before: lastParsedCommentID }
  let response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
  if (response.error) throw Error(response.error)
  const newRecursiveList = dirtyRecursiveList.concat(response.data.children)
  const commentEntriesLength = response.data.children.length
  if (commentEntriesLength) {
    lastParsedCommentID = response.data.children[0].data.name
    lastParsedCommentIDs = []
    query = { after: lastParsedCommentID }
    response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
    if (response.error) throw Error(response.error)
    lastParsedCommentIDs.push(lastParsedCommentID)
    for (let i = 0; i < 4; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
  }
  switch (true) {
    case (commentEntriesLength === 25):
      return await getNewComments(newRecursiveList)
    case (commentEntriesLength !== 25):
    case (commentEntriesLength === 0):
      console.log('Done making comments call!')
      return newRecursiveList
    default :
      return false
  }
}

const addOrRemoveDeltaToOrFromWiki = async ({
  createdUTC,
  user,
  linkTitle,
  id,
  linkURL,
  author,
  action,
}) => { // returns flair count
  const createWikiHiddenParams = async (content) => {
    try {
      const hiddenParams = {
        comment: i18n[locale].hiddenParamsComment,
        deltas: [],
      }
      if (content) {
        const links = _.uniq(
            content.match(new RegExp(`/r/${subreddit}/comments/[^()[\\]]+\?context=2`, 'g'))
        )
        const arrayFullnames = (
          _(links)
            .reduce((a, e, i) => {
              const arrayIndex = Math.floor(i / 100)
              a[arrayIndex] = a[arrayIndex] || []
              a[arrayIndex].push(
                  `t1_${e.replace(
                      e.slice(0, e.lastIndexOf('/') + 1), ''
                  ).replace('?context=2', '')}`
              )
              return a
            }, [])
            .map(e => e.join(','))
        )
        await new Promise(async (res, rej) => {
          _.forEach(arrayFullnames, async (fullnames) => {
            try {
              const commentRes = await reddit.query(
                  `/r/${subreddit}/api/info?${stringify({ id: fullnames })}`
              )
              if (commentRes.error) throw Error(commentRes.error)
              const comments = _.get(commentRes, 'data.children')
              const fullLinkIds = _.reduce(comments, (array, comment) => {
                const linkId = _.get(comment, 'data.link_id')
                array.push(linkId)
                return array
              }, []).join(',')
              const listingsRes = await reddit.query(
                  `/r/${subreddit}/api/info?${stringify({ id: fullLinkIds })}`
              )
              const listingsData = _.get(listingsRes, 'data.children')
              const titles = _.reduce(listingsData, (array, listing) => {
                const title = _.get(listing, 'data.title').replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB')
                array.push(title)
                return array
              }, [])
              const baseUrls = _.reduce(listingsData, (array, listing) => {
                const title = (
                  _.get(listing, 'data.permalink')
                    .replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB')
                )
                array.push(title)
                return array
              }, [])
              _.forEach(comments, (comment, i) => {
                const name = (
                  _.get(comment, 'data.name')
                    .replace('t1_', '') // this is the comment id
                )
                const base = baseUrls[i]
                const title = titles[i]
                const awardedBy = _.get(comment, 'data.author')
                const unixUTC = _.get(comment, 'data.created_utc')
                const params = {
                  b: base,
                  dc: name,
                  t: title,
                  ab: awardedBy,
                  uu: unixUTC,
                }
                hiddenParams.deltas.push(params)
              })
              if (hiddenParams.deltas.length === links.length) res()
            } catch (err) {
              console.log(err)
            }
          })
          setTimeout(() => rej(), 60000)
        })
        return hiddenParams
      }
      return hiddenParams
    } catch (err) {
      console.log('216 - failed to create wiki hidden params')
      console.log(err)
      return {
        comment: i18n[locale].hiddenParamsComment,
        deltas: [],
      }
    }
  }
  let content = await getWikiContent({
    api: reddit,
    wikiPage: `user/${user}`,
    subreddit,
  })
  // First, find all wiki pages and combine for parsing
  if (content && content.indexOf('Any delta history before February 2015 can be found at') > -1) {
    const oldContent = await getWikiContent(`userhistory/user/${user}`)
    content += oldContent
  }
  // Look for hidden params. If not there, create
  const hiddenParams = parseHiddenParams(content) || await createWikiHiddenParams(content)
  if (action === 'add') {
    hiddenParams.deltas.push({
      b: linkURL,
      dc: id,
      t: linkTitle.replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB'),
      ab: author,
      uu: createdUTC,
    })
  } else if (action === 'remove') {
    _.remove(hiddenParams.deltas, { dc: id })
  } else console.log('No action called for addOrRemoveDeltaToOrFromWiki'.red)
  hiddenParams.deltas = _.uniqBy(hiddenParams.deltas, 'dc')
  hiddenParams.deltas = _.sortBy(hiddenParams.deltas, ['uu'])
  const flairCount = hiddenParams.deltas.length
  let newContent = `[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)\r\n/u/${user} has received ${flairCount} delta${flairCount === 1 ? '' : 's'} for the following comments:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n`
  _.forEachRight(hiddenParams.deltas, col => {
    const { b, dc, t, ab, uu } = col
    const date = new Date(uu * 1000)
    const [month, day, year] = [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    const newRow = (
          `|${month}/${day}/${year}|[${t.replace(
              /AXDK9vhFALCkjXPmwvSB/g, ')'
          )}](${b})|[Link](${b}${dc}?context=2)|/u/${ab}|\r\n`
    )
    newContent += newRow
  })
  const query = {
    page: `user/${user}`,
    reason: 'Added a delta',
    content: newContent,
  }
  const response = await reddit.query(
      { URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(query) }
  )
  if (response.error) throw Error(response.error)
  return flairCount
}

const updateFlair = async ({ name, flairCount }) => {
  const flairQuery = {
    name,
    text: `${flairCount}∆`,
  }
  const response = await reddit.query(
      { URL: `/r/${subreddit}/api/flair?${stringify(flairQuery)}`, method: 'POST' }
  )
  if (response.error) throw Error(response.error)
  return true
}

const verifyThenAward = async (comment) => {
  const {
    created_utc: createdUTC,
    author, body,
    link_id: linkID,
    link_title: linkTitle,
    link_url: linkURL,
    id,
    name,
    parent_id: parentID,
  } = comment
  try {
    console.log(author, body, linkID, parentID)
    const hiddenParams = {
      comment: i18n[locale].hiddenParamsComment,
      issues: {},
      parentUserName: null,
    }
    const issues = hiddenParams.issues
    const query = {
      parent: name,
      text: '',
    }
    const json = await reddit.query(
        `/r/${subreddit}/comments/${linkID.slice(3)}/?comment=${parentID.slice(3)}`
    )
    if (json.error) throw Error(json.error)
    const parentThing = json[1].data.children[0].data
    const listing = json[0].data.children[0].data
    if (parentThing.author === '[deleted]') return true
    if (author === botUsername) return true
    hiddenParams.parentUserName = parentThing.author
    if (
        (
            !parentID.match(/^t1_/g) ||
            parentThing.author === listing.author
        ) && author.toLowerCase() !== 'mystk'
    ) {
      console.log(
        `BAILOUT parent author, ${parentThing.author} is listing author, ${listing.author}`
      )
      const text = i18n[locale].noAward.op
      issues.op = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    if (parentThing.author === botUsername) {
      console.log(`BAILOUT parent author, ${parentThing.author} is bot, ${botUsername}`)
      const text = i18n[locale].noAward.db3
      issues.db3 = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    if (parentThing.author === author && author.toLowerCase() !== 'mystk') {
      console.log(`BAILOUT parent author, ${parentThing.author} is author, ${author}`)
      const text = i18n[locale].noAward.self
      issues.self = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    let issueCount = Object.keys(issues).length
    const rejected = i18n[locale].noAward.rejected
    // if there are issues, append the issues i18n to the DeltaBot comment
    if (issueCount) {
      // if there are multiple issues, stick at the top that there are multiple issues
      if (issueCount >= 2) {
        let issueCi18n = i18n[locale].noAward.issueCount
        issueCi18n = issueCi18n.replace(/ISSUECOUNT/g, issueCount)
        query.text = `${rejected} ${issueCi18n}\n\n${query.text}`
      } else {
        query.text = `${rejected} ${query.text}`
      }
    // if there are no issues yet, then check for comment length. checking for this
    // last allows it to be either the issues above or this one
    } else if (body.length < 50) {
      console.log(`BAILOUT body length, ${body.length}, is shorter than 50`)
      let text = i18n[locale].noAward.littleText
      issues.littleText = 1
      text = text.replace(/PARENTUSERNAME/g, parentThing.author)
      if (query.text.length) query.text += '\n\n'
      query.text += text
      query.text = `${rejected} ${query.text}`
    }
    issueCount = Object.keys(issues).length
    if (issueCount === 0) {
      console.log('THIS ONE IS GOOD. AWARD IT')
      const flairCount = await addOrRemoveDeltaToOrFromWiki(
        {
          user: parentThing.author,
          id,
          linkTitle,
          linkURL,
          author,
          createdUTC,
          action: 'add',
        }
      )
      let text = i18n[locale].awardDelta
      text = text.replace(/USERNAME/g, parentThing.author).replace(/DELTAS/g, flairCount).replace(/SUBREDDIT/g, subreddit)
      if (query.text.length) query.text += '\n\n'
      query.text += text
      await updateFlair({ name: parentThing.author, flairCount })
    }
    query.text += `${i18n[locale].global}\n[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)`
    const send = await reddit.query({ URL: `/api/comment?${stringify(query)}`, method: 'POST' })
    if (send.error) throw Error(send.error)
    const flattened = _.flattenDeep(send.jquery)
    const commentFullName = _.get(_.find(flattened, 'data.name'), 'data.name')
    const distinguishResp = await reddit.query(
      {
        URL: `/api/distinguish?${stringify({ id: commentFullName, how: 'yes' })}`,
        method: 'POST',
      }
    )
    if (distinguishResp.error) throw Error(distinguishResp.error)
    return true
  } catch (err) {
    console.log(err)
    return true
  }
}

const checkForDeltas = async () => {
  last[0] = Date.now()
  try {
    const comments = await getNewComments()
    _.each(comments, async (entry, index) => {
      const {
        link_title,
        link_id,
        author, body,
        body_html,
        edited,
        parent_id,
        id,
        name,
        author_flair_text,
        link_url,
        created_utc,
        created,
      } = entry.data
      comments[index] = {
        link_title,
        link_id,
        author,
        body,
        body_html,
        edited,
        parent_id,
        id,
        name,
        author_flair_text,
        link_url,
        created_utc,
        created,
      }
      const removedBodyHTML = (
          body_html
            .replace(/blockquote&gt;[^]*\/blockquote&gt;/, '')
            .replace(/pre&gt;[^]*\/pre&gt;/, '')
      )
      if (
          (!!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ/) || !!removedBodyHTML.match(/!delta/i))
      ) await verifyThenAward(comments[index])
    })
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
  setTimeout(checkForDeltas, 30000)
}

router.get('/getNewComments', async (ctx, next) => {
  try {
    const comments = await getNewComments()
    const body = comments
    ctx.body = body
  } catch (err) {
    console.log('Error!'.red)
    ctx.body = err
  }
  await next()
})
router.get('/checkForDeltas', async (ctx, next) => {
  try {
    const comments = await getNewComments()
    await checkForDeltas()
    const body = comments
    ctx.body = body
  } catch (err) {
    console.log('Error!'.red)
    ctx.body = err
  }
  await next()
})
router.get('/dynamic/*', async (ctx, next) => {
  const response = await reddit.query(`/${ctx.params['0']}?${stringify(ctx.query)}`)
  if (response.error) throw Error(response.error)
  ctx.body = response
  await next()
})

app
  .use(bodyParser({ enableTypes: ['json', 'form', 'text'] }))
  .use(async (ctx, next) => {
    console.log(`${ctx.url}`.gray)
    await next()
  })
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(6969)

const checkMessagesforDeltas = async () => {
  last[1] = Date.now()
  try {
    console.log('Making unread messages call!')
    const unreadInboxResponse = await reddit.query('/message/unread')
    console.log('Got unread messages call!')
    if (unreadInboxResponse.error) throw Error(unreadInboxResponse.error)
    const comments = (
      _(unreadInboxResponse)
        .get('data.children')
        .reduce((result, obj) => {
          if (obj.data.subject.toLowerCase() === 'add') {
            const commentLinks = (
                _.get(obj, 'data.body')
                  .match(new RegExp(`/r/${subreddit}/comments/[^()[\\]& \n]+`, 'g'))
            )
            const fullName = _.get(obj, 'data.name')
            result.names.push(fullName)
            result.commentLinks = result.commentLinks.concat(commentLinks)
            return result
          }
          return result
        }, { names: [], commentLinks: [] })
    )
    const deleteCommentLinks = (
      _(unreadInboxResponse)
        .get('data.children')
        .reduce((result, obj) => {
          if (obj.data.subject.toLowerCase() === 'delete') {
            const commentLinks = (
                _.get(obj, 'data.body')
                  .match(new RegExp(`/r/${subreddit}/comments/[^()[\\]& \n]+`, 'g'))
            )
            const fullName = _.get(obj, 'data.name')
            result.names.push(fullName)
            result.commentLinks = result.commentLinks.concat(commentLinks)
            return result
          }
          return result
        }, { names: [], commentLinks: [] })
    )
    if (deleteCommentLinks.commentLinks.length) {
      deleteCommentLinks.commentLinks = _.uniq(deleteCommentLinks.commentLinks)
      const getParentUserName = async ({ parent_id: parentId }) => {
        const parentComment = await reddit.query(
            `/r/${subreddit}/api/info?${stringify({ id: parentId })}`
        )
        return _.get(parentComment, 'data.children[0].data.author')
      }
      for (let i = 0; i < deleteCommentLinks.commentLinks.length; ++i) {
        try {
          const commentLink = deleteCommentLinks.commentLinks[i]
          const response = await reddit.query(`${commentLink}`)
          const {
            replies,
            link_id,
            author,
            body,
            body_html,
            edited,
            parent_id,
            id,
            name,
            author_flair_text,
            created_utc,
            created,
          } = _.get(response, '[1].data.children[0].data')
          const { title: link_title, url: link_url } = _.get(response, '[0].data.children[0].data')
          const comment = {
            link_title,
            link_id,
            author,
            body,
            body_html,
            edited,
            parent_id,
            id,
            name,
            author_flair_text,
            link_url,
            created_utc,
            created,
          }
          const dbReply = _.reduce(_.get(replies, 'data.children'), (result, reply) => {
            if (result) return result
            else if (_.get(reply, 'data.author') === botUsername) return _.get(reply, 'data')
            return result
          }, null)
          if (dbReply) {
            const hiddenParams = parseHiddenParams(dbReply.body)
            if (_.keys(hiddenParams.issues).length === 0) { // check if it was a valid delta
              const parentUserName = hiddenParams.parentUserName || await getParentUserName(comment)
              const flairCount = await addOrRemoveDeltaToOrFromWiki(
                {
                  user: parentUserName,
                  id: comment.id,
                  action: 'remove',
                }
              )
              await updateFlair({ name: parentUserName, flairCount })
            }
            // Delete the comment
            await reddit.query({
              URL: '/api/del',
              method: 'POST',
              body: stringify({ id: dbReply.name }),
            })
          }
        } catch (err) {
          console.error(err)
        }
      }
    }
    if (comments.commentLinks.length) {
      comments.commentLinks = _.uniq(comments.commentLinks)
      try {
        for (let i = 0; i < comments.commentLinks.length; ++i) {
          const commentLink = comments.commentLinks[i]
          const response = await reddit.query(`${commentLink}`)
          const {
            replies,
            link_id,
            author,
            body,
            body_html,
            edited,
            parent_id,
            id,
            name,
            author_flair_text,
            created_utc,
            created,
          } = _.get(response, '[1].data.children[0].data')
          const { title: link_title, url: link_url } = _.get(response, '[0].data.children[0].data')
          const comment = {
            link_title,
            link_id,
            author,
            body,
            body_html,
            edited,
            parent_id,
            id,
            name,
            author_flair_text,
            link_url,
            created_utc,
            created,
          }
          const dbReplied = _.reduce(_.get(replies, 'data.children'), (result, reply) => {
            if (result) return result
            return _.get(reply, 'data.author') === botUsername
          }, false)
          const removedBodyHTML = (
              body_html
                .replace(/blockquote&gt;[^]*?\/blockquote&gt;/, '')
                .replace(/pre&gt;[^]*?\/pre&gt;/, '')
          )
          if (
              !dbReplied &&
              (
                  !!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ/) ||
                  !!removedBodyHTML.match(/!delta/i)
              )
          ) await verifyThenAward(comment)
        }
      } catch (err) {
        console.error(err)
      }
    }
    if (comments.commentLinks.length || deleteCommentLinks.commentLinks.length) {
      const read = await reddit.query(
        {
          URL: '/api/read_message',
          method: 'POST',
          body: stringify(
            {
              id: JSON.stringify(
                [].concat(
                  comments.names, deleteCommentLinks.names
                )
              ).replace(/"|\[|\]/g, ''),
            }
          ),
        }
      )
      if (read.error) throw Error(read.error)
    }
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
  setTimeout(checkMessagesforDeltas, 30000)
}

const entry = async () => {
  try {
    await reddit.connect()
    if (!lastParsedCommentID) {
      const response = await reddit.query(`/r/${subreddit}/comments.json`, true)
      for (let i = 0; i < 5; ++i) {
        lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
      lastParsedCommentID = lastParsedCommentIDs[0]
    }
    checkForDeltas()
    checkMessagesforDeltas()
  } catch (err) {
    console.error(err)
  }
  try {
    let deltaBoardsThreeCredentials
    try {
      deltaBoardsThreeCredentials = require('./delta-boards-three-credentials')
    } catch (err) {
      console.log('Missing credentials for delta-boards-three! Using base creds as fallback!'.red)
      try {
        deltaBoardsThreeCredentials = require('./credentials')
      } catch (err) {
        console.log(
          'Please contact the author for credentials or create your own credentials json!'.red
        )
        console.log(`{
          "username": "Your Reddit username",
          "password": "Your Reddit password",
          "clientID": "Your application ID",
          "clientSecret": "Your application secret",
          "subreddit": "Your subreddit to moderate"
        }`.red)
      }
    }
    const deltaBoardsThree = new DeltaBoardsThree({
      credentials: deltaBoardsThreeCredentials,
      version: packageJson.version,
      flags
    })
    deltaBoardsThree.initialStart()
  } catch (err) {
    console.error(err)
  }
}; entry()
