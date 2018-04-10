const admin = require('firebase-admin')
const serviceAccount = require('../../config/credentials/fire.json')
const uuidv1 = require('uuid/v1')
const DeltaBotModule = require('./delta-bot-module')

class WattInviteRunner extends DeltaBotModule {
  constructor(legacyRedditApi) {
    super(__filename, legacyRedditApi)
  }
  async bootstrap() {
    super.bootstrap()
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://watt-firebase.firebaseio.com/',
      databaseAuthVariableOverride: {
        uid: 'watt-invite-runner',
      },
    })
    const scheduleInMinutes = 30
    // should be 1800000 for 30 minutes
    const scheduleInMillis = scheduleInMinutes * 60 * 1000

    setInterval(await this.checkForNewInvites.bind(this), scheduleInMillis)
    await this.checkForNewInvites()
  }

  // a proper blocking version of <Array>.forEach
  // this is a problem when you are running asynchronous calls inside of a forEach
  // https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404
  static async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index += 1) {
      await callback(array[index], index, array)
    }
  }

  async checkForNewInvites() {
    try {
      const posts = await this.reddit.getNew('changemyview', { limit: 75 })
      const oldPosts = []
      const yesterdayInUtcSeconds = Math.floor(new Date().getTime() / 1000) - (24 * 60 * 60)
      posts.forEach((p) => {
        // console.log(`POST: ${p.author.name} ${p.title} ${p.id}`)
        if (p.created_utc < yesterdayInUtcSeconds) {
          oldPosts.push(p)
        }
      })

      const eligiblePosts = []
      const invitePosts = []

      try {
        await this.constructor.asyncForEach(oldPosts, async (p) => {
          // also need to check that the post is 24 hrs old
          if (p.num_comments > 50) {
            console.log(`Traversing ${p.title}`)
            let OpReplies = 0
            const object = {
              author: p.author.name,
              title: p.title,
            }
            eligiblePosts.push(object)
            // OPTIMIZATION TODO
            // if this post has already gotten invited, don't do calls against it
            // you already did that work earlier
            // get all the comments
            const comments = await p.comments.fetchAll()
            // for each comment, get all the replies
            await this.constructor.asyncForEach(comments, async (c) => {
              const replies = await c.replies.fetchAll()
              // for each reply, get the reply tree
              await this.constructor.asyncForEach(replies, async (reddit) => {
                await this.getAllReplies(reddit, object.author,
                  () => { OpReplies += 1 })
              })
            })
            if (OpReplies >= 5) {
              const invite = {
                author: p.author.name,
                title: p.title,
                authorReplies: OpReplies,
                postId: p.id,
              }
              invitePosts.push(invite)
            }
            console.log(`Done reading ${p.title} created at ${p.created_utc} with ${OpReplies} OP replies\n\n`.green)
          }
        })
        await this.saveInvitedPosts(invitePosts)
      } catch (e) {
        console.log('\n\nWATT RUNNER ERROR')
        console.log(e)
      }
    } catch (e) { console.log(e) }
    // once checkForNewInvites is done, schedule another run for 30 minutes from now
    // setTimeout(() => this.checkForNewInvites(), schedule)
  }

  async getAllReplies(reply, author, countOpCallback) {
  // if there is a reply
    if (reply) {
      // check if the reply is the OP
      // callback to count replies fom OP
      if (reply.author.name === author) {
        countOpCallback()
      }
      // callback for keeping track of the "latest" reply
      // TODO
      // fetch all the REPLIES of the individual REPLY
      const childReplies = await reply.replies.fetchAll()
      // recursively, synchronously call getAllReplies
      await this.constructor.asyncForEach(childReplies, async (reddit) => {
        this.getAllReplies(reddit, author, countOpCallback)
      })
    }
  }

  async saveInvitedPosts(invited) {
  // firebase DB
    const db = admin.database()
    // get a db reference, which won't exist until the first push
    const currentlyInvited = await db.ref('invites').once('value')
    // for each new potential invite
    await this.constructor.asyncForEach(invited, async (i) => {
    // by default assume you are NOT sending email
      try {
        if (currentlyInvited.val()) {
          // compare to currently invited
          let isInvited = false
          currentlyInvited.forEach((c) => {
            if (c.val().postId === i.postId) {
              // already invited
              // BAIL
              console.log('invite already sent')
              isInvited = true
            }
          })
          if (!isInvited) {
          // TODO
          // create the invite right now and add it to the DB
          // maybe use the key?
            const newInvite = {
              author: i.author,
              postId: i.postId,
              dateAdded: Date.now(),
              cmvTitle: i.title,
              wattPostUid: uuidv1(), // for the invite link
            }

            const message = {
              to: 'sonofdiesel', // When we are ready, 'sonofdiesel' will be replaced with i.author
              subject: 'Invitation to the CMV Podcast and/or projectWATT',
              text: `Hi ${i.author},
              \n\nThis is an automated message regarding your post [${newInvite.cmvTitle}](http://reddit.com/${newInvite.postId}). The r/changemyview mod team would like to invite you to participate in one of the following options in order to keep the conversation going:
              \n\nA) Come on [the CMV podcast](https://changemyview.net/podcast/) to talk about your experience in the subreddit, any convincing arguments you read, how you might think about the topic going forward, etc. Please submit your interest [here](https://www.reddit.com/message/compose?to=%2Fr%2FCMVpodcast&subject=Podcast).
              \n\nB) Contribute to a research project called [projectWATT](http://projectwatt.com) (What are they thinking?) to capture your perspective on the issue you posted about. The goal of projectWATT is to create a database of perspectives to share beyond the scope of Reddit. If you’re interested, you can use this link to contribute:
              \n\nhttp://projectwatt.com/invite/${newInvite.wattPostUid}
              \n\n**This link is a password to contribute, edit or delete your projectWATT article. Do not share it.**
              \n\nC) Both A & B - this would be ideal, but we understand if you don't have time or would just prefer one over the other.
              \n\nFeel free to message us if you have any questions or concerns.
              \n\nThanks for reading!
              `,
            }
            await this.reddit.composeMessage(message)
            await db.ref('invites').push(newInvite)
            console.log(`New invite sent to ${i.author} and saved to db`)
          }
        } else {
          const newInvite = {
            author: i.author,
            postId: i.postId,
            dateAdded: Date.now(),
            cmvTitle: i.title,
            wattPostUid: uuidv1(), // for the invite link
          }

          const message = {
            to: 'sonofdiesel',
            subject: 'Contribute to ProjectWATT',
            text: `Hi ${i.author},
            \n\nThis is an automated message regarding your post [${newInvite.cmvTitle}](http://reddit.com/${newInvite.postId}). The r/changemyview mod team would like to invite you to participate in one of the following options in order to keep the conversation going:
            \n\nA) Come on [the CMV podcast](https://changemyview.net/podcast/) to talk about your experience in the subreddit, any convincing arguments you read, how you might think about the topic going forward, etc. Please submit your interest [here](https://www.reddit.com/message/compose?to=%2Fr%2FCMVpodcast&subject=Podcast).
            \n\nB) Contribute to a research project called [projectWATT](http://projectwatt.com) (What are they thinking?) to capture your perspective on the issue you posted about. The goal of projectWATT is to create a database of perspectives to share beyond the scope of Reddit. If you’re interested, you can use this link to contribute:
            \n\nhttp://projectwatt.com/invite/${newInvite.wattPostUid}
            \n\n**This link is a password to contribute, edit or delete your projectWATT article. Do not share it.**
            \n\nC) Both A & B - this would be ideal, but we understand if you don't have time or would just prefer one over the other.
            \n\nFeel free to message us if you have any questions or concerns.
            \n\nThanks for reading!
            `,
          }

          await this.reddit.composeMessage(message)
          await db.ref('invites').push(newInvite)
          console.log(`New invite sent to ${i.author} and saved to db`)
        }
      } catch (e) { console.log(e) }
    })
  }
}
module.exports = WattInviteRunner
