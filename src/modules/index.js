import _ from 'lodash'
import fs from 'fs'
import path from 'path'

const directoryFiles = fs.readdirSync(__dirname)
const pulledFilesFromdirectoryFiles = _.pull(directoryFiles, 'index.js', 'delta-bot-module.js')

export default _.reduce(pulledFilesFromdirectoryFiles, (result, fileName) => {
  const keyName = _.chain(fileName).trimEnd('.js').camelCase().value()
  const fullFilePath = path.join(__dirname, fileName)
  result[keyName] = require(fullFilePath).default
  return result
}, {})
