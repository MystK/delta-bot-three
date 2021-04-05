/* eslint-disable no-useless-escape, no-use-before-define, max-len */
/* eslint-env jest */
const path = require('path')

// first, dynamically grab the file name of what we're testing
const fileName = path.basename(__filename)
const componentFileName = fileName.match(/([^]+).spec.js/)[1]

// bring in the component to be used in tests
const component = require(`./${componentFileName}.js`)

describe('utilities', () => {
  it('should format posts with links properly', () => {
    const { formatAwardedText } = component
    expect(formatAwardedText(paulRyanCMVPost)).toBe(paulRyanFormatted)
    expect(formatAwardedText(bernieSandersCMVPost)).toBe(bernieSandersFormatted)
  })
  it('should escape only underscores', () => {
    const { escapeUnderscore } = component
    expect(escapeUnderscore('__UsName__')).toBe('\\_\\_UsName\\_\\_')
  })
  it('should correctly check for deltas', () => {
    const { checkCommentForDelta } = component
    // eslint-disable-next-line camelcase
    const createMockCommentClass = body_html => ({ body_html })
    expect(checkCommentForDelta(createMockCommentClass(''))).toBe(false)
    expect(checkCommentForDelta(createMockCommentClass('!delta'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('!dElTa'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('Δ'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('∆'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('&#8710;'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('&amp;#8710;'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass(
      'blockquote&gt;&amp;#8710;&#8710;∆Δ!delta!dElTa/blockquote&gt;'))).toBe(false)
    expect(checkCommentForDelta(createMockCommentClass(
      'pre&gt;&amp;#8710;&#8710;∆Δ!delta!dElTa/pre&gt;'))).toBe(false)
  })

  it('should be able to identify comment id from URL', () => {
    const { parseCommentIdFromURL } = component
    const url1 = 'https://www.reddit.com/r/db3_wyantb/comments/5ls1vf/deltacomments_in_cmv_can_we_get_a_stick_comment/di7f3wr'
    const url2 = 'https://www.reddit.com/r/db3_wyantb/comments/5ls1vf/deltacomments_in_cmv_can_we_get_a_stick_comment/second'
    expect(parseCommentIdFromURL(url1)).toBe('di7f3wr')
    expect(parseCommentIdFromURL(url2)).toBe('second')
  })
})

const paulRyanCMVPost = 'How about Paul Ryan\'s [anti-poverty plan](http://www.speaker.gov/press-release/republicans-unveil-better-way-fight-poverty)?  His goals and justifications there seem to be focused on measurable impact on quality of life (\"opportunities to succeed\", \"tailor benefits to people\'s needs\", \"way out of poverty\", \"help you stay on the path from dependence to independence\").\n\nHe wants to improve lives; whether his plan is the plan most likely to succeed is a different question, but that\'s clearly his motivation.\n\nOr look at his plan to [replace Obamacare:](http://www.speaker.gov/press-release/obamacare-failing-speaker-ryan-s-remarks-leadership-press-conference) “For people seeing their premiums skyrocket, Obamacare has already failed. For people suddenly stuck with only one plan to choose from—a monopoly—this law has failed them. For people with deductibles so high that they try to get by without going to the doctor, this law has failed them.  \n\n“There is a better way, and we have made it clear what we want to replace Obamacare with: a truly patient-centered system with more choices and lower costs. A system that gives you the control and the freedom that Obamacare has taken from you.\"\n\nThat\'s all about quality of life.  Again, he might be wrong or right on the details, but the plan is to improve quality of life.'
const paulRyanFormatted = 'How about Paul Ryan\'s anti-poverty plan?  His goals and justifications there seem to be focused on measurable impact on quality of life ("opportunities to succeed", "tailor benefits to people\'s needs"...'
const bernieSandersCMVPost = '&gt;With President Sanders, we would have become a successful democratic-socialist nation that prides itself on its liberal and free culture.\n\nBefore we start talking about how Bernie could defeat Donald lets dispell the notion of democratic-socialism. What he describes as \"socialism\", socialism is not. He used Denmark as an example but the [Danish PM tried to explain to him that Denmark does not want to be associated with socialism](http://www.headlinepolitics.com/denmark-tells-bernie-sanders-stop-lying-country/)\n\n&gt;nation that prides itself on its liberal and free culture.\n\nThe US is already a liberal and free culture. Way more liberal than what we are here in Europe. And by liberal i mean open society that protects individual rights, industrial and free market economics and the rule of law. These principles have worked for the American people and they have made the US the one and only global power. Not regional but global. \n\nThe American people are deeply tied to this liberal tradition. Even conservatives are really classical liberals ( not all of them but a lot of them. It is the same with liberals. Not all of them are social democrats ). Still talking about individual rights and the rule of law etc. And in order to win an election you need to win not only the vote of one perticular group of people. You need to win the majority of the nation. There is **no way** that a conservative or a libertarian or a sensible liberal would vote for Bernie Sanders. And why is that ?\n\nSocialism is fringe politics. His opponents in the Trump team would focus their campaign on promoting socialist failures ( and they would have plenty of material to work with ) from Cuba to Venezuela.  I can already hear you say \"yeah but what about Scandinavia ?\".\n\nSo Scandinavia. Scandinavian countries are free market economics ( [they rank extremelly high on economic freedom](http://www.heritage.org/index/ranking) ). They can fund their welfare state for two reasons. One: the US pays for their defence. Two: they generate capital via the free market which is the only sensible way to generate enough money in order to spend on welfare. \n\nSo its simple. There is not way that the majority of Americans would ever vote for a self proclaimed socialist. The American way has proven to be successful and the American people understand that and thats why it won\'t be easy for them to abandon their liberal insitutions for a more centralized socialist way. And remember as i said before you need to win more than the socialists to win the general election. *Trump played the antiglobalization card in order to win the anti free market vote while portaying himself as a businessman to win the free market vote too.*\n\nAs far as what Trump did that Sanders and Hillary could not? Trump won the \"flyover America\". The people that don\'t care about the so called 1%. All they wanted was for their small communities to be industrious again. \n\nOn immigration Sanders has said that [\"open borders are a Koch brothers scheme\"](https://www.youtube.com/watch?v=vf-k6qOfXz0). Is that enough to win the immigration issue voters ? No. Trump took the issue to a new level. There is not a chance that someone could have trumped Trump on immigration. He mobilized people like never before. \n\nA Trump Sanders battle would have been an all populist race. Trump just played the populist card better. He won the moment you locked down the primaries.'
const bernieSandersFormatted = '[Quote] Before we start talking about how Bernie could defeat Donald lets dispell the notion of democratic-socialism. What he describes as "socialism", socialism is not. He used Denmark as an example ...'
