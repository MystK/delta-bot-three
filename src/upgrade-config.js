import fsp from 'fs-promise'
import _ from 'lodash'
import path from 'path'

export default () => {
  const configJsonPath = path.join(process.cwd(), 'config/config.json')
  try {
    fsp.statSync(configJsonPath)
  } catch (expectedErr) {
    const credentialsFilePath = path.join(process.cwd(), 'config/credentials/credentials.json')
    try {
      fsp.statSync(credentialsFilePath)
    } catch (expectedErr2) {
      console.log('You need a credentials.json file in ./config/credentials/credentials.json')
      console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientID": "Your application ID",
  "clientSecret": "Your application secret"
}`)
      process.exit()
    }
    const credentialsJson = fsp.readJsonSync(credentialsFilePath)
    if (
      'subreddit' in credentialsJson &&
      'deltaLogSubreddit' in credentialsJson
    ) {
      fsp.writeJsonSync(configJsonPath, {
        subreddit: credentialsJson.subreddit,
        deltaLogSubreddit: credentialsJson.deltaLogSubreddit,
      })
    } else {
      console.log('You need a config.json file in ./config/config.json')
      console.log(`{
  "subreddit": "YOUR_DEVELOPMENT_CHANGEMYVIEW_SUBREDDIT_HERE",
  "deltaLogSubreddit": "YOUR_DEVELOPMENT_DELTALOG_SUBREDDIT_HERE"
}`)
      process.exit()
    }
  }

  const directoryFileNames = fsp.readdirSync(path.join(process.cwd(), 'config/credentials'))
  let changed
  _.forEach(directoryFileNames, fileName => {
    const credentialsFilePath = path.join(process.cwd(), 'config/credentials', fileName)
    const credentialsJson = fsp.readJsonSync(credentialsFilePath)
    changed = false
    if ('subreddit' in credentialsJson) {
      delete credentialsJson.subreddit
      changed = true
    }
    if ('deltaLogSubreddit' in credentialsJson) {
      delete credentialsJson.deltaLogSubreddit
      changed = true
    }
    if ('clientID' in credentialsJson) {
      credentialsJson.clientId = credentialsJson.clientID
      delete credentialsJson.clientID
      changed = true
    }
    if (changed) fsp.writeJsonSync(credentialsFilePath, credentialsJson)
  })
  if (changed) console.log('Upgraded configs!')
}
