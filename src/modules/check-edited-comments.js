const _ = require('lodash')

const {
  checkCommentForDelta,
  generateHiddenParamsFromDeltaComment,
  getDeltaBotReply,
  parseHiddenParams,
} = require('./../utils')
const { verifyThenAward } = require('./../index')
const DeltaBotModule = require('./delta-bot-module')

class CheckEditedComments extends DeltaBotModule {
  constructor(legacyRedditApi) {
    super(__filename, legacyRedditApi)
  }
  async bootstrap() {
    super.bootstrap()
    this.startCron()
  }
  async startCron() {
    const editedComments = await this.reddit
      .getSubreddit(this.subreddit)
      .getEdited({ only: 'comments' })
    for (const comment of editedComments) {
      if (checkCommentForDelta(comment)) {
        console.log(`There is a delta in comment: ${comment.name}! Check if Delta Bot replied!`)

        // first use snoowrap and grab the comment
        const commentWithReplies = await this.reddit
          .getComment(comment.id)
          .fetch()

          // then fetch ALL of the comment replies
        const commentReplies = await commentWithReplies.replies.fetchAll({})

        // grab the deltabot reply so see if it's been worked on
        const dbReply = getDeltaBotReply(this.botUsername, commentReplies)
        if (!dbReply) await verifyThenAward(comment)
        // deltabot has already replied
        // check if the deltabot comment needs to change from when deltabot
        // originally commented by comparing the hidden params
        else {
          const oldHiddenParems = parseHiddenParams(dbReply.body)
          const oldIssueCount = Object.keys(oldHiddenParems.issues).length

          // only worry about unsuccessful delta comment
          if (oldIssueCount === 0) continue
          const newHiddenParams = await generateHiddenParamsFromDeltaComment({
            botUsername: this.botUsername,
            reddit: this.reddit,
            comment: commentWithReplies,
          })

          // omit checking hiddenParams.parentUserName because it could have turned into [deleted]
          // omit checkinghiddenParams.comment because it doesn't matter
          if (!_.isEqual(newHiddenParams.issues, oldHiddenParems.issues)) {
            await this.reddit
              .getComment(dbReply.id)
              .delete()
            await verifyThenAward(comment)
          }
        }
      }
    }
    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.startCron(), 60000)
  }
}

module.exports = CheckEditedComments
