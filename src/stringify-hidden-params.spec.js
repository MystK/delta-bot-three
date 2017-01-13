/* eslint-env jest */
//
// Unit tests for stringify-hidden-params
//

import { default as input } from './stringify-hidden-params'

describe('stringify-hidden-params', () => {
  it('should add param start and stop tags', () => {
    const dummy = {
      dummy_val: true,
    }
    const res = input(dummy)
    expect(res).toBe('[​](HTTP://DB3PARAMSSTART\n' +
                     '{\n' +
                     '  "dummy_val": true\n' +
                     '}\n' +
                     'DB3PARAMSEND)')
  })
  it('should replace ")" with "-paren---"', () => {
    const dummy = {
      dummy_val: 'value)',
    }
    const res = input(dummy)
    expect(res).toBe('[​](HTTP://DB3PARAMSSTART\n' +
                     '{\n' +
                     '  "dummy_val": "value-paren---"\n' +
                     '}\n' +
                     'DB3PARAMSEND)')
  })
})
