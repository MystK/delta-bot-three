const _ = require('lodash')

const {
  checkCommentForDelta,
  generateHiddenParamsFromDeltaComment,
  getDeltaBotReply,
  parseHiddenParams,
  getLastValidCommentId,
  getNewCommentsBeforeCommentId,
} = require('./../utils')
const { verifyThenAward } = require('./../index')
const DeltaBotModule = require('./delta-bot-module')

class CheckComments extends DeltaBotModule {
  constructor(legacyRedditApi) {
    super(__filename, legacyRedditApi, { lastParsedCommentIDs: [] })
  }
  async bootstrap() {
    await super.bootstrap()
    this.startCron()
  }
  async startCron() {
    try {
      console.log(`${this.moduleName}: Starting Cron Job`)

      const { subredditDriver } = this

      const { lastParsedCommentIDs } = this.state

      // if there isn't a state of last parsed comments, go ahead and create it from the https://www.reddit.com/r/changemyview/comments.json call
      if (!lastParsedCommentIDs.length) {
        const comments = await subredditDriver.getNewComments()
        this.state = {
          lastParsedCommentIDs: comments.map(comment => comment.name),
        }
      }

      // sometimes the state is bad because comments are deleted
      // grab the last valid comment id and start from there
      // if we don't do this and we accidentally grab a deleted comment,
      // we would be stuck forever and not be able to parse new comments
      const commentIdToStartBefore = await getLastValidCommentId({
        lastParsedCommentIDs,
        subredditDriver,
      })

      // grab the comments before(newer than) the last parsed comment
      // we use before/after words because Reddit API uses that
      // this is ordered from oldest to newest
      const comments = await getNewCommentsBeforeCommentId({
        commentId: commentIdToStartBefore,
        subredditDriver,
      })

      // loop through the comments to check for deltas
      for (const comment of comments) {
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

      // now update the state
      // _.get(_.last(comments), 'name') is the newest comment ID
      // if no comments are found, use commentIdToStartBefore
      // commentIdToStartBefore and lastParsedCommentIDs[0] can be different
      // if a comment was deleted
      if (lastParsedCommentIDs[0] !== (_.get(_.last(comments), 'name') || commentIdToStartBefore)) {
        // grab the already parsed comments to use as the new state
        const alreadyParsedComments = await subredditDriver.getNewComments({
          after: _.get(comments, '[0].name') || commentIdToStartBefore,
        })
        this.state = {
          lastParsedCommentIDs: [_.get(_.last(comments), 'name') || commentIdToStartBefore].concat(
            alreadyParsedComments.map(comment => comment.name)
          ),
        }
      }
    } catch (err) {
      console.log(err)
    }

    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.startCron(), 30000)
  }
}

module.exports = CheckComments
