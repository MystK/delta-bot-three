const _ = require('lodash')
const moment = require('moment')
const { AllHtmlEntities: entities } = require('html-entities')

const escapeUnderscore = string => string.replace(/_/g, '\\_')

const getCommentAuthor = comment => _.get(comment, 'author.name') || _.get(comment, 'author')

// accepts a string from the "body" key of a reddit comment object
// first decode it if it's not already. I think it's safe to do it multiple times
const removeQuotesFromBody = body => entities.decode(body)
  .replace(/>[^\n]*?\n/g, '') // remove the quotes

const checkCommentForDelta = (comment) => {
  const { body_html } = comment
  // this removes the text that are in quotes
  const removedBodyHTML = (
    body_html
      .replace(/blockquote&gt;[^]*?\/blockquote&gt;/g, '')
      .replace(/pre&gt;[^]*?\/pre&gt;/g, '')
      .replace(/blockquote>[^]*?\/blockquote>/g, '')
      .replace(/pre>[^]*?\/pre>/g, '')
  )
  // this checks for deltas
  if (
    !!removedBodyHTML.match(/&amp;#8710;|&#8710;|&#916;|&amp;916;|∆|Δ/i) ||
    !!removedBodyHTML.match(/!delta/i) ||
    !!removedBodyHTML.match(/&delta;/i)
  ) {
    return true
  }
  return false
}

const locale = 'en-us'
const i18n = require('./../i18n')

const bypassOPCheck = _.some(process.argv, arg => arg === '--bypass-op-check')

/**
 * generated new hidden parameters that usually live in the deltabot
 * comment from a user's delta comment ID
 * @param {object} params
 * @param {Comment} params.comment - snoowrap comment class
 * @param {Snoowrap} params.reddit - snoowrap reddit driver
 * @returns {object} - hidden parameters object
 */
const generateHiddenParamsFromDeltaComment = async ({ comment, reddit, botUsername }) => {
  // prepare the hidden params object
  const hiddenParams = {
    comment: i18n[locale].hiddenParamsComment,
    issues: {},
    parentUserName: null,
  }
  // define issues to avoid writing hiddenParams.issues all the time
  const issues = hiddenParams.issues

  // fill out parentUserName of hiddenParams
  // that is the username that the delta comment is replying to
  // first grab the parent comment
  const parentComment = await reddit.getComment(comment.parent_id).fetch()
  // now populate hiddenParems.parentUsername
  hiddenParams.parentUserName = parentComment.author.name

  // get the submission thread
  const submission = await reddit.getSubmission(comment.link_id).fetch()

  // if the author of the comment being deltaed is OP/submission author
  // bypassOPCheck is used for debugging
  if (parentComment.author.name === submission.author.name && bypassOPCheck === false) issues.op = 1
  // if the comment being deltaed is the bot
  if (parentComment.author.name === botUsername) issues.db3 = 1
  // if the comment being deltaed and the delta comment author are the same
  // bypassOPCheck is used for debugging
  if (parentComment.author.name === comment.author.name && bypassOPCheck === false) issues.self = 1
  // if there are no issues yet, then check for comment length
  // checking for this last allows it to be either the issues above or this one
  if (
    Object.keys(issues).length === 0 &&
    removeQuotesFromBody(comment.body).length < 50
  ) issues.littleText = 1

  console.log(`Hidden parameters generated for comment ID ${comment.name}`)
  return hiddenParams
}

const generateDeltaBotCommentFromDeltaCommentDEPRECATED = async ({
  comment,
  botUsername,
  reddit,
  subreddit,
}) => {
  const {
    body,
    link_id: linkID,
    name,
    parent_id: parentID,
  } = comment
  const author = comment.author.name || comment.author
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
    ) && bypassOPCheck === false
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
  } else if (removeQuotesFromBody(body).length < 50) {
    console.log(`BAILOUT body length, ${body.length}, is shorter than 50`)
    let text = i18n[locale].noAward.littleText
    issues.littleText = 1
    text = text.replace(/PARENTUSERNAME/g, parentThing.author)
    if (query.text.length) query.text += '\n\n'
    query.text += text
    query.text = `${rejected} ${query.text}`
  }
  issueCount = Object.keys(issues).length
  return { issueCount, parentThing, query, hiddenParams }
}

const packageJson = require('./../package.json')

const getUserAgent = moduleName => (
  `DB3/v${packageJson.version} ${moduleName ? `- ${moduleName} Module ` : ''}- by MystK`
)

const getDeltaBotReply = (botUsername, replies) => {
  if (!replies) return false

  // legacy Reddit API Driver
  if ('data' in replies) {
    return _.reduce(_.get(replies, 'data.children'), (result, reply) => {
      if (result) return result
      else if (_.get(reply, 'data.author') === botUsername) return _.get(reply, 'data')
      return result
    }, null)
  }

  // snoowrap
  return _.reduce(replies, (result, reply) => {
    if (result) return result
    else if (reply.author.name === botUsername) return reply
    return result
  }, null)
}

const getParsedDate = () => {
  const now = new Date()
  return `As of ${now.getMonth() + 1}/${now.getDate()}/` +
    `${now.getFullYear().toString().slice(2)} ` +
    `${_.padStart(now.getHours(), 2, 0)}:${_.padStart(now.getMinutes(), 2, 0)} ` +
    `${now.toString().match(/\(([A-Za-z\s].*)\)/)[1]}`
}

const getWikiContent = async ({ api, subreddit, wikiPage }) => {
  try {
    const resp = await api.query(`/r/${subreddit}/wiki/${wikiPage}`, true, true)
    const html = resp.match(
      /<textarea readonly class="source" rows="20" cols="20">[^]+<\/textarea>/
    )[0].replace(/<textarea readonly class="source" rows="20" cols="20">|<\/textarea>/g, '')
    return entities.decode(html)
  } catch (err) {
    return false
  }
}

const parseHiddenParams = (string) => {
  try {
    const hiddenSection = string.match(/DB3PARAMSSTART[^]+DB3PARAMSEND/)[0]
    const stringParams = hiddenSection.slice(
      'DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length
    ).replace(/&quot;/g, '"').replace(/-paren---/g, ')').replace(/-s---/g, ' ')
    return JSON.parse(entities.decode(stringParams))
  } catch (error) {
    return false
  }
}

/* eslint-disable no-irregular-whitespace */
const stringifyObjectToBeHidden = input => `[​](HTTP://DB3PARAMSSTART${JSON.stringify(input).replace(/\)/g, '-paren---').replace(/ /g, '-s---')}DB3PARAMSEND)`

const TRUNCATE_AWARD_LENGTH = 200
const truncateAwardedText = (text) => {
  if (text.length > TRUNCATE_AWARD_LENGTH) {
    // if the condition below is true, then the [Quote] tag is going to be cut off
    // and the whole text won't be a link, so we have to make sure it's not cut off
    // we have to check if it exists which is why the first condition is !== -1
    // it's only a problem when the quote index is between 194 and 199
    const lastQuoteIndex = text.lastIndexOf('[Quote]')
    if (lastQuoteIndex !== -1 && lastQuoteIndex >= 194 && lastQuoteIndex <= 199) {
      return `${text.substring(0, lastQuoteIndex)}[Quote]...`
    }
    return `${text.substring(0, TRUNCATE_AWARD_LENGTH)}...`
  }
  return text
}
const formatAwardedText = (text) => {
  /* eslint-disable no-useless-escape */
  const textWithoutQuotes = entities.decode(text) // html decode the text
    .replace(/>[^]*?\n\n/g, '[Quote] ') // replace quotes
    .replace(/\n+/g, ' ') // one or more newlines -> just one space
    .replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1') // links like `[foo](URL)` -> just `foo` in log line
  /* eslint-enable no-useless-escape */
  return truncateAwardedText(textWithoutQuotes)
}

const checkIfValidCommentId = async ({ commentId, subredditDriver }) => (
  (await subredditDriver.getNewComments({ after: commentId, limit: 1 })).length >= 1
)

const getLastValidCommentId = async ({ lastParsedCommentIDs, subredditDriver }) => {
  const clonedLastParsedCommentIDs = _.clone(lastParsedCommentIDs)
  let lastValidCommentId
  let isValidCommentId
  do {
    lastValidCommentId = clonedLastParsedCommentIDs.shift()
    isValidCommentId = await checkIfValidCommentId({
      commentId: lastValidCommentId,
      subredditDriver,
    })
  } while (!isValidCommentId)
  return lastValidCommentId
}

const getNewCommentsBeforeCommentId = async ({
  atLeastMinutesOld = 0,
  commentId,
  subredditDriver,
}) => {
  console.log(`Getting new comments before comment ID, ${commentId}`)
  const commentsToReturn = []
  let commentIdToUse
  let continuousComments
  let continueOn = true
  while (continueOn) {
    commentIdToUse = _.get(continuousComments, '[0].name') || commentId
    continuousComments = await subredditDriver.getNewComments({
      limit: 100,
      before: commentIdToUse,
    })
    if (continuousComments.length) {
      _.forEachRight(continuousComments, (comment) => {
        const { created_utc: createdUtc } = comment

        // if atLeastMinutesOld is passed, get comments that are only X minutes old
        // this specific feature is used for a trailing module double checking comments
        // so it never reaches the newest comments
        if (moment().diff(createdUtc * 1000, 'minutes') >= atLeastMinutesOld) {
          commentsToReturn.push(comment)
        } else continueOn = false
      })
    } else continueOn = false
  }
  console.log(`Found ${commentsToReturn.length} for ${commentId}`)
  return commentsToReturn
}

const parseCommentIdFromURL = (url) => {
  const parts = url.split('/')
  const idPart = _.last(parts)
  return idPart
}

module.exports = {
  escapeUnderscore,
  getCommentAuthor,
  checkCommentForDelta,
  generateDeltaBotCommentFromDeltaCommentDEPRECATED,
  generateHiddenParamsFromDeltaComment,
  getUserAgent,
  getDeltaBotReply,
  getParsedDate,
  getWikiContent,
  parseHiddenParams,
  stringifyObjectToBeHidden,
  formatAwardedText,
  checkIfValidCommentId,
  getLastValidCommentId,
  getNewCommentsBeforeCommentId,
  parseCommentIdFromURL,
}
