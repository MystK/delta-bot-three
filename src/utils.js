import path from 'path'
import _ from 'lodash'

export const escapeUnderscore = string => string.replace(/_/g, '\\_')

export const getCommentAuthor = comment => _.get(comment, 'author.name') || _.get(comment, 'author')

export const checkCommentForDelta = comment => {
  const { body_html } = comment
  // this removes the text that are in quotes
  const removedBodyHTML = (
    body_html
      .replace(/blockquote&gt;[^]*?\/blockquote&gt;/, '')
      .replace(/pre&gt;[^]*?\/pre&gt;/, '')
      .replace(/blockquote>[^]*?\/blockquote>/, '')
      .replace(/pre>[^]*?\/pre>/, '')
  )
  // this checks for deltas
  if (
    !!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ/) ||
    !!removedBodyHTML.match(/!delta/i)
  ) {
    return true
  }
  return false
}

const locale = 'en-us'
const isDebug = _.some(process.argv, arg => arg === '--db3-debug')
const i18n = require(path.resolve('i18n'))
const bypassOPCheck = _.some(process.argv, arg => arg === '--bypass-op-check')
export const generateDeltaBotCommentFromDeltaComment = async ({
  comment,
  botUsername,
  reddit,
  subreddit,
}) => {
  const {
    author, body,
    link_id: linkID,
    name,
    parent_id: parentID,
  } = comment
  if (isDebug) console.log(author, body, linkID, parentID)
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
  return { issueCount, parentThing, query, hiddenParams }
}

const packageJson = require(path.resolve('./package.json'))
export const getUserAgent = moduleName => (
  `DB3/v${packageJson.version} ${moduleName ? `- ${moduleName} Module ` : ''}- by MystK`
)

export const getDeltaBotReply = (botUsername, replies) => {
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

export const getParsedDate = () => {
  const now = new Date()
  return `As of ${now.getMonth() + 1}/${now.getDate()}/` +
    `${now.getFullYear().toString().slice(2)} ` +
    `${_.padStart(now.getHours(), 2, 0)}:${_.padStart(now.getMinutes(), 2, 0)} ` +
    `${now.toString().match(/\(([A-Za-z\s].*)\)/)[1]}`
}
