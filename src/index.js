/*
Corner Cases
Edited comments are not handled
*/
require('colors')
const _ = require('lodash')
const promisify = require('promisify-node')
const mkdirp = require('mkdirp')
/*
const Koa = require('koa')
const Router = require('koa-router')
*/
const fs = require('fs')
const { stringify } = require('query-string')
const path = require('path')
// const bodyParser = require('koa-bodyparser')
const Reddit = require('./reddit-api-driver')
const DeltaBoards = require('./delta-boards')
const unesc = require('unescape')
const {
  checkCommentForDelta,
  generateDeltaBotCommentFromDeltaComment,
  getDeltaBotReply,
  getCommentAuthor,
  getWikiContent,
  parseHiddenParams,
  stringifyObjectToBeHidden,
  formatAwardedText,
} = require('./utils')
const upgradeConfig = require('./upgrade-config')

upgradeConfig()

const i18n = require(path.resolve('i18n'))

const isDebug = _.some(process.argv, arg => arg === '--db3-debug')
const deltaLogEnabled = _.some(process.argv, arg => arg === '--enable-delta-log')
if (isDebug) {
  console.log('server.js called!  running in debug mode')
}

const last = []
setInterval(() => {
  const now = Date.now()
  if (now < last[0] + 1800000 || now < last[1] + 1800000) process.exit(1)
}, 3600000)

const locale = 'en-us'
/*
const app = new Koa()
const router = new Router()
*/
mkdirp.sync('./config/credentials')
mkdirp.sync('./config/state')

fs.writeFile = promisify(fs.writeFile)
let credentials

function logCredentialsFile() {
  console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientId": "Your application ID",
  "clientSecret": "Your application secret",
  "subreddit": "Your subreddit to moderate",
  "deltaLogSubreddit": "Your subreddit to post delta logs to"
}`.red)
}
try {
  credentials = require(path.resolve('./config/credentials/credentials.json'))
} catch (err) {
  console.log('Missing credentials!'.red)
  console.log('Please create your own credentials json!'.red)
  console.log('Put it into ./config/credentials/credentials.json!'.red)
  logCredentialsFile()
  process.exit()
}

let state
let lastParsedCommentIDs
let lastParsedCommentID
try {
  state = require(path.resolve('./config/state/state.json'))

  lastParsedCommentIDs = state.lastParsedCommentIDs
  lastParsedCommentID = lastParsedCommentIDs[0]
} catch (err) {
  console.log('No or curropted state.json file! Starting from no state!'.gray)
  state = {}
  lastParsedCommentIDs = []
  lastParsedCommentID = null
}
const packageJson = require(path.resolve('./package.json'))

const configJsonPath = path.join(process.cwd(), 'config/config.json')
const configJson = require(path.resolve(configJsonPath))

const deltaLogSubreddit = configJson.deltaLogSubreddit
const subreddit = configJson.subreddit
const botUsername = credentials.username
const flags = { isDebug, deltaLogEnabled }
const reddit = new Reddit(credentials, packageJson.version, 'main', flags)

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
      /* eslint-disable no-await-in-loop */
      response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
      /* eslint-enable no-await-in-loop */
      if (response.error) throw Error(response.error)
    }
    lastParsedCommentIDs = []
    lastParsedCommentIDs.push(lastParsedCommentID)
    for (let i = 0; i < 4; i += 1) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile(
      './config/state/state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2)
    )
    if (lastParsedCommentIDs.length === 0) {
      lastParsedCommentID = null
      await fs.writeFile('./config/state/state.json', '{}')

      const stateResponse = await reddit.query(`/r/${subreddit}/comments.json`, true)
      if (stateResponse.error) throw Error(stateResponse.error)
      for (let i = 0; i < 5; i += 1) {
        lastParsedCommentIDs.push(_.get(stateResponse, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile(
        './config/state/state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2)
      )
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
    for (let i = 0; i < 4; i += 1) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile(
      './config/state/state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2)
    )
  }
  switch (true) {
    case (commentEntriesLength === 25):
      return getNewComments(newRecursiveList)
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
            content.match(new RegExp(`/r/${subreddit}/comments/[^()[\\]]+?context=2`, 'g'))
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
  // eslint-disable-next-line
  let newContent = `[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)\r\n/u/${user} has received ${flairCount} delta${flairCount === 1 ? '' : 's'}:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| :------: | :------: | :------: | :------: |\r\n`
  _.forEachRight(hiddenParams.deltas, (col) => {
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

const introductoryTemplate = _.template(i18n[locale].firstDeltaMessage)
const sendIntroductoryMessage = async ({ username, flairCount }) => {
  if (flairCount === 1) {
    const introMessageContent = {
      to: username,
      subject: i18n[locale].firstDeltaSubject,
      text: introductoryTemplate({ username, subreddit }),
    }
    const response = await reddit.query(
      { URL: `/r/${subreddit}/api/compose?${stringify(introMessageContent)}`, method: 'POST' }
    )
    if (response.error) throw Error(response.error)
  }
  return true
}

const distinguishThing = async (args) => {
  const distinguishResp = await reddit.query({
    URL: `/api/distinguish?${stringify(args)}`,
    method: 'POST',
  })
  if (distinguishResp.error) throw Error(distinguishResp.error)
  return true
}

const makeComment = async (commentArgs) => {
  const send = await reddit.query({
    URL: `/api/comment?${stringify(commentArgs.content)}`,
    method: 'POST',
  })
  if (send.error) throw Error(send.error)
  const flattened = _.flattenDeep(send.jquery)
  const commentFullName = _.get(_.find(flattened, 'data.name'), 'data.name')
  await distinguishThing({ id: commentFullName, how: 'yes', sticky: !!commentArgs.sticky })
  return commentFullName
}

/* When DB3 starts up, it doesn't have { PostId, LogId, StickyCommentId } mappings, so load them */
const loadDeltaLogFromWiki = async () => {
  const rawInternalWikiText = await reddit.query({
    URL: `/r/${deltaLogSubreddit}/wiki/internal`,
    method: 'GET',
  })
  if (rawInternalWikiText.error) throw Error(rawInternalWikiText)
  const wikiTextMd = _.get(rawInternalWikiText, 'data.content_md')
  if (isDebug) console.log('WIKI internal GET:', wikiTextMd)
  return parseHiddenParams(wikiTextMd) || []
}
// used for storing both sticky comment info in original post, which links to the DeltaLog mirror
let deltaLogKnownPosts = null

const wasDeltaMadeByAuthor = comment => comment.link_author === getCommentAuthor(comment)

/* Invoked after the DeltaLog post is made, so `deltaLogKnownPosts` will be populated */
const deltaLogStickyTemplate = _.template(i18n[locale].deltaLogSticky)
const findOrMakeStickiedComment = async (linkID, comment, deltaLogPost) => {
  const stickyID = deltaLogPost.wikientry.stickiedCommentID
  const opName = deltaLogPost.postentry.opUsername
  const deltasAwardedByOP = deltaLogPost.postentry.comments.filter(
    comm => comm.awardingUsername === opName
  ).length
  const awardStr = deltasAwardedByOP + ((deltasAwardedByOP === 1) ? ' delta' : ' deltas')

  if (stickyID) {
    // Update the N in 'OP has awarded N deltas...'
    const stickyCommentBody = deltaLogStickyTemplate({
      username: opName,
      linkToPost: `/r/${deltaLogSubreddit}/comments/${deltaLogPost.wikientry.deltaLogPostID}`,
      deltaLogSubreddit,
      opawarded: awardStr,
    })

    const updateParams = {
      text: stickyCommentBody,
      thing_id: stickyID,
    }

    const updateResponse = await reddit.query({
      URL: `/api/editusertext?${stringify({ thing_id: stickyID })}`,
      method: 'POST',
      body: stringify(updateParams),
    })
    if (updateResponse.error) { console.error(updateResponse.error) }

    return true
  }
  if (!wasDeltaMadeByAuthor(comment)) {
    return true
  }
  const stickiedCommentID = await makeComment({
    sticky: true,
    content: {
      thing_id: linkID,
      text: deltaLogStickyTemplate({
        username: getCommentAuthor(comment),
        linkToPost: `/r/${deltaLogSubreddit}/comments/${deltaLogPost.wikientry.deltaLogPostID}`,
        deltaLogSubreddit,
        opawarded: awardStr,
      }),
    },
  })
  deltaLogPost.wikientry.stickiedCommentID = stickiedCommentID
  return true
}

/* Gets the text of a DeltaLog post, for use when updating the log */
const loadPostText = async (deltaLogPostID) => {
  const postDetails = await reddit.query({
    URL: `/r/${deltaLogSubreddit}/comments/${deltaLogPostID}/.json`,
    method: 'GET',
  })
  if (postDetails.error) throw Error(postDetails.error)
  const postJSON = (postDetails && postDetails.json) || postDetails
  const postData = postJSON[0].data.children[0].data
  return postData.selftext
}

const mapDeltaLogCommentEntry = (comment, parentThing) => ({
  awardingUsername: getCommentAuthor(comment),
  awardedUsername: getCommentAuthor(parentThing),
  awardedText: formatAwardedText(parentThing.body),
  awardedLink: comment.link_url + parentThing.id,
  deltaCommentFullName: comment.name,
})

/* Replaces the "From OP" section contents with appropriate comment links */
const deltaLogOPEntryTemplate = _.template(i18n[locale].deltaLogOPEntry)
const logOpComments = (comments, postBase) => {
  const REPLACE_SECTION = '[](HTTP://DB3-FROMOP)'
  if (_.isEmpty(comments)) {
    return postBase.replace(REPLACE_SECTION, i18n[locale].deltaLogNoneYet)
  }
  return _.reduce(comments, (postSoFar, comment) => {
    const commentString = deltaLogOPEntryTemplate(comment)
    return postSoFar.replace(REPLACE_SECTION, `${commentString}\n${REPLACE_SECTION}`)
  }, postBase)
}

/* Replaces the "From Other Users" section contents with appropriate comment links */
const deltaLogOtherEntryTemplate = _.template(i18n[locale].deltaLogOtherEntry)
const logOtherComments = (comments, postBase) => {
  const REPLACE_SECTION = '[](HTTP://DB3-FROMOTHER)'
  if (_.isEmpty(comments)) {
    return postBase.replace(REPLACE_SECTION, i18n[locale].deltaLogNoneYet)
  }
  return _.reduce(comments, (postSoFar, comment) => {
    const commentString = deltaLogOtherEntryTemplate(comment)
    return postSoFar.replace(REPLACE_SECTION, `${commentString}\n${REPLACE_SECTION}`)
  }, postBase)
}

const groupCommentsByOp = hiddenParams => _.partition(
  hiddenParams.comments, { awardingUsername: hiddenParams.opUsername }
)

/* Given a JSON object like the hidden param on deltalog pages, produces the output page */
const deltaLogContentTemplate = _.template(i18n[locale].deltaLogContent)
const formatDeltaLogContent = (deltaLogCreationParams) => {
  const { opUsername, linkToPost } = deltaLogCreationParams
  const deltaLogBaseContent = deltaLogContentTemplate({
    opUsername,
    linkToPost,
  })
  const [commentsByOP, commentsByOther] = groupCommentsByOp(deltaLogCreationParams)
  const deltaLogContent = logOpComments(
    commentsByOP,
    logOtherComments(commentsByOther, deltaLogBaseContent)
  )
  return `${deltaLogContent}\n${stringifyObjectToBeHidden(deltaLogCreationParams)}`
}

const updateDeltaLogPostFromHiddenParams = async (hiddenParams, deltaLogPostID) => {
  const newDeltaLogContent = formatDeltaLogContent(hiddenParams)
  const updateParams = {
    text: newDeltaLogContent,
    thing_id: `t3_${deltaLogPostID}`,
  }
  const updateResponse = await reddit.query({
    URL: `/api/editusertext?${stringify({ thing_id: `t3_${deltaLogPostID}` })}`,
    method: 'POST',
    body: stringify(updateParams),
  })
  if (updateResponse.error) throw Error(updateResponse.error)
}

/* Updates a DeltaLog post, appending to the appropriate section (op/not op) */
const addDeltaToLog = async (linkID, comment, parentThing, existingPost) => {
  const postText = await loadPostText(existingPost.deltaLogPostID)
  const deltaLogCreationParams = parseHiddenParams(postText)
  deltaLogCreationParams.comments.push(mapDeltaLogCommentEntry(comment, parentThing))
  await updateDeltaLogPostFromHiddenParams(deltaLogCreationParams, existingPost.deltaLogPostID)
  return deltaLogCreationParams
}

const findDeltaLogPost = async (linkID) => {
  // first, load the Delta Log database from the wiki
  if (deltaLogKnownPosts == null) {
    deltaLogKnownPosts = await loadDeltaLogFromWiki()
  }
  return _.find(deltaLogKnownPosts, { originalPostID: linkID })
}

/* Makes delta log posts & updates OP/Other Users sections */
const deltaLogSubjectTemplate = _.template(i18n[locale].deltaLogTitle)
const findOrMakeDeltaLogPost = async (linkID, comment, parentThing) => {
  const possiblyExistingPost = await findDeltaLogPost(linkID)
  // if the log post already exists, all we'll need to do is update
  if (possiblyExistingPost != null) {
    const postContents = await addDeltaToLog(linkID, comment, parentThing, possiblyExistingPost)
    return { wikientry: possiblyExistingPost, postentry: postContents }
  }
  // otherwise, create it & add the delta details to appropriate section
  const deltaLogSubject = deltaLogSubjectTemplate(
      { title: unesc(comment.link_title) }
  )
  const deltaLogCreationParams = {
    opUsername: comment.link_author,
    linkToPost: comment.link_url,
    comments: [mapDeltaLogCommentEntry(comment, parentThing)],
  }
  const deltaLogContent = formatDeltaLogContent(deltaLogCreationParams)
  const postParams = {
    api_type: 'json',
    kind: 'self',
    sr: deltaLogSubreddit,
    text: deltaLogContent,
    title: deltaLogSubject,
  }
  const newPost = await reddit.query({
    URL: `/api/submit?${stringify(postParams)}`,
    method: 'POST',
  })
  if (newPost.error) throw Error(newPost.error)
  const postDetails = newPost.json
  const wikiPostObject = {
    originalPostID: linkID,
    originalPostURL: comment.link_url,
    deltaLogPostID: postDetails.data.id,
  }
  deltaLogKnownPosts.push(wikiPostObject)
  await distinguishThing({ id: `t3_${postDetails.data.id}`, how: 'yes', sticky: false })
  return { wikientry: wikiPostObject, postentry: deltaLogCreationParams }
}

/* Updates the delta log hidden contents with known CMV posts -> DeltaLog posts & sticky comments */
const updateDeltaLogWikiLinks = async () => {
  const postParams = {
    content: stringifyObjectToBeHidden(deltaLogKnownPosts),
    page: 'internal',
    reason: 'DeltaBot update',
  }
  const update = await reddit.query({
    URL: `/r/${deltaLogSubreddit}/api/wiki/edit`,
    method: 'POST',
    body: stringify(postParams),
  })
  if (update.error) throw Error(update.error)
  return update
}

exports.verifyThenAward = async (comment) => {
  const {
    created_utc: createdUTC,
    link_id: linkID,
    link_title: linkTitle,
    link_url: linkURL,
    id,
  } = comment

  // check if DeltaBot has already replied to this comment
  const commentURL = `${linkURL}${id}.json`.replace('https://www.reddit.com', '')
  const response = await reddit.query(commentURL, true)
  const replies = _.get(response, '[1].data.children[0].data.replies')
  const dbReplied = _.reduce(_.get(replies, 'data.children'), (result, reply) => {
    if (result) return result
    return _.get(reply, 'data.author') === botUsername
  }, false)

  if (dbReplied) {
    return false
  }

  try {
    const {
      issueCount,
      parentThing,
      query,
      hiddenParams,
    } = await generateDeltaBotCommentFromDeltaComment({ comment, botUsername, reddit, subreddit })
    if (!query) return true
    if (issueCount === 0) {
      console.log('THIS ONE IS GOOD. AWARD IT')
      const flairCount = await addOrRemoveDeltaToOrFromWiki(
        {
          user: parentThing.author,
          id,
          linkTitle,
          linkURL,
          author: getCommentAuthor(comment),
          createdUTC,
          action: 'add',
        }
      )
      let text = i18n[locale].awardDelta
      text = text.replace(/USERNAME/g, getCommentAuthor(parentThing))
        .replace(/DELTAS/g, flairCount)
        .replace(/SUBREDDIT/g, subreddit)
      if (query.text.length) query.text += '\n\n'
      query.text += text
      await updateFlair({ name: parentThing.author, flairCount })
      await sendIntroductoryMessage({ username: parentThing.author, flairCount })
    }
    // eslint-disable-next-line
    query.text += `${i18n[locale].global}\n[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)`
    await makeComment({ content: query, sticky: false })
    if (issueCount === 0 && deltaLogEnabled) {
      const deltaLogPost = await findOrMakeDeltaLogPost(linkID, comment, parentThing)
      const stickiedComment = await findOrMakeStickiedComment(linkID, comment, deltaLogPost)
      await updateDeltaLogWikiLinks(linkID, comment, deltaLogPost.wikientry, stickiedComment)
    }
  } catch (err) {
    console.log(err)
  }
  return true
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
        link_author,
        created_utc,
        created,
      } = entry.data
      comments[index] = {
        link_title,
        link_id,
        link_author,
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
      if (checkCommentForDelta(comments[index])) await exports.verifyThenAward(comments[index])
    })
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
  setTimeout(checkForDeltas, 30000)
}

/*
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
*/

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
      for (let i = 0; i < deleteCommentLinks.commentLinks.length; i += 1) {
        /* eslint-disable no-await-in-loop */
        try {
          const commentLink = deleteCommentLinks.commentLinks[i].replace(/\/\?context=[\d]+$/i, '')
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
          const dbReply = getDeltaBotReply(botUsername, replies)
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

              // if Delta Log is enabled, delete stuff related to that
              if (deltaLogEnabled) {
                // grab the relevant info from the comment
                const { link_id: linkId, name: deltaCommentName } = comment

                // find the deltaLog JSON related to the comment
                const deltaLogPostDataJson = await findDeltaLogPost(linkId)
                if (deltaLogPostDataJson) {
                  // get the hidden parameters from the post
                  // first, get the post text
                  const postText = await loadPostText(deltaLogPostDataJson.deltaLogPostID)
                  // then, parse the hidden parameters from the post text
                  const postTextHiddenParams = parseHiddenParams(postText)

                  // generate new hidden parameters with the comment data removed
                  const newPostTextHiddenParams = _.cloneDeep(postTextHiddenParams)
                  newPostTextHiddenParams.comments = _.reject(
                    postTextHiddenParams.comments, { deltaCommentFullName: deltaCommentName }
                  )

                  // get arrays of comments from OP and comments
                  const [commentsByOP] = groupCommentsByOp(newPostTextHiddenParams)

                  // delete the sticky comment if there are no comments by OP
                  if (commentsByOP.length === 0 && 'stickiedCommentID' in deltaLogPostDataJson) {
                    await reddit.query({
                      URL: '/api/del',
                      method: 'POST',
                      body: stringify({ id: deltaLogPostDataJson.stickiedCommentID }),
                    })
                    delete deltaLogPostDataJson.stickiedCommentID
                  }

                  console.log(newPostTextHiddenParams)
                  if (_.get(newPostTextHiddenParams, 'comments.length') === 0) {
                    // if there are no comments, delete the whole post
                    await reddit.query({
                      URL: '/api/del',
                      method: 'POST',
                      body: stringify({ id: `t3_${deltaLogPostDataJson.deltaLogPostID}` }),
                    })

                    // delete the post from the delta log database
                    deltaLogKnownPosts = _.reject(deltaLogKnownPosts, { originalPostID: linkId })
                  } else {
                    // if there are comments, update it
                    updateDeltaLogPostFromHiddenParams(
                      newPostTextHiddenParams,
                      deltaLogPostDataJson.deltaLogPostID
                    )
                  }

                  // update the internal wiki database
                  await updateDeltaLogWikiLinks()
                }
              }
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
        /* eslint-enable no-await-in-loop */
      }
    }
    if (comments.commentLinks.length) {
      comments.commentLinks = _.uniq(comments.commentLinks)
      try {
        for (let i = 0; i < comments.commentLinks.length; i += 1) {
          /* eslint-disable no-await-in-loop */
          const commentLink = comments.commentLinks[i]
          const response = await reddit.query(`${commentLink}`)
          const {
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
          const {
            author: link_author,
            title: link_title,
            url: link_url,
          } = _.get(response, '[0].data.children[0].data')
          const comment = {
            link_title,
            link_id,
            link_author,
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
                .replace(/blockquote&gt;[^]*?\/blockquote&gt;/, '')
                .replace(/pre&gt;[^]*?\/pre&gt;/, '')
          )
          if (!!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ/) ||
            !!removedBodyHTML.match(/!delta/i)) {
            await exports.verifyThenAward(comment)
          }
          /* eslint-enable no-await-in-loop */
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
              ).replace(/"|\[|]/g, ''),
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
    console.log('Start loading modules!'.bgGreen.cyan)
    const Modules = require('./modules')
    await _.reduce(Modules, async (result, Module, name) => {
      try {
        console.log(`Trying to load ${name} module!`.bgCyan)
        const module = new Module(reddit)
        result[name] = module
        await module.bootstrap()
      } catch (err) {
        console.error(`${err.stack}`.bgRed)
      }
      console.log(`Done trying to load ${name} module!`.bgCyan)
      return result
    }, {})
    console.log('Finished loading modules!'.bgGreen.cyan)
    if (!lastParsedCommentID) {
      const response = await reddit.query(`/r/${subreddit}/comments.json`, true)
      for (let i = 0; i < 5; i += 1) {
        lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile(
        './config/state/state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2)
      )
      lastParsedCommentID = lastParsedCommentIDs[0]
    }
    checkForDeltas()
    checkMessagesforDeltas()
  } catch (err) {
    console.error(err)
  }
  try {
    let deltaBoardsCredentials
    /* eslint-disable import/no-unresolved */
    try {
      deltaBoardsCredentials = require(
        path.resolve('./config/credentials/delta-boards-credentials.json')
      )
    } catch (err) {
      console.log('Missing credentials for delta-boards! Using base creds as fallback!'.red)
      try {
        deltaBoardsCredentials = require(path.resolve('./config/credentials/credentials.json'))
      } catch (secondErr) {
        console.log(
          'Please contact the author for credentials or create your own credentials json!'.red
        )
        logCredentialsFile()
      }
    }
    /* eslint-enable import/no-unresolved */
    const deltaBoards = new DeltaBoards({
      subreddit,
      credentials: deltaBoardsCredentials,
      version: packageJson.version,
      flags,
    })
    deltaBoards.initialStart()
  } catch (err) {
    console.error(err)
  }
}; entry()
