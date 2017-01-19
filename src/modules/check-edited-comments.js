import _ from 'lodash'

import {
  checkCommentForDelta,
  generateDeltaBotCommentFromDeltaComment,
  getDeltaBotReply,
} from './../utils'
import { verifyThenAward } from './../index'
import DeltaBotModule from './delta-bot-module'
import parseHiddenParams from './../parse-hidden-params'

class CheckEditedComments extends DeltaBotModule {
  constructor(legacyRedditApi) {
    super(__filename, legacyRedditApi)
  }
  async start() {
    super.start()
    this.scanForEditedComments()
  }
  async scanForEditedComments() {
    const editedComments = await this.reddit
      .getSubreddit(this.subreddit)
      .getEdited({ only: 'comments' })
    for (const comment of editedComments) {
      if (checkCommentForDelta(comment)) {
        console.log('There is a delta in here! Check if Delta Bot replied!')
        const commentWithReplies = await this.reddit
          .getComment(comment.id)
          .fetch()
        const commentReplies = await commentWithReplies.replies.fetchAll({})
        const dbReply = getDeltaBotReply(this.botUsername, commentReplies)
        if (!dbReply) verifyThenAward(comment)
        else {
          const oldHiddenParems = parseHiddenParams(dbReply.body)
          const oldIssueCount = Object.keys(oldHiddenParems.issues).length
          const {
            hiddenParams: newHiddenParams,
          } = await generateDeltaBotCommentFromDeltaComment({
            botUsername: this.botUsername,
            subreddit: this.subreddit,
            reddit: this.legacyRedditApi,
            comment,
          })
          if (oldIssueCount > 0 && !_.isEqual(newHiddenParams, oldHiddenParems)) {
            await this.reddit
              .getComment(dbReply.id)
              .delete()
            verifyThenAward(comment)
          }
        }
      }
    }
    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.scanForEditedComments(), 60000)
  }
}

export default CheckEditedComments
