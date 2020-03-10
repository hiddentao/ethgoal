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

exports.keccak256 = a => `0x${keccak256(a)}`
