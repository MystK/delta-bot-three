import { AllHtmlEntities as entities } from 'html-entities'

export default string => {
  try {
    const hiddenSection = string.match(/DB3PARAMSSTART[^]+DB3PARAMSEND/)[0]
    const stringParams = hiddenSection.slice(
      'DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length
    ).replace(/-paren---/g, ')')
    return JSON.parse(entities.decode(stringParams))
  } catch (error) {
    return false
  }
}
