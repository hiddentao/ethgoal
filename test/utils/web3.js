const { keccak256 } = require('js-sha3')
const web3 = require('web3')

  ;[
    'toBN',
    'isBN',
    'toHex',
    'toWei',
    'asciiToHex',
  ].forEach(m => {
    exports[m] = web3.utils[m]
  })

exports.sha3 = a => `0x${keccak256(a)}`
