const MNEMONIC = (require('./package.json').scripts.devnet.match(/\'(.+)\'/))[1]

console.log(`Mnemonic: [ ${MNEMONIC} ]`)

module.exports = {
  providerOptions: {
    total_accounts: 10,
    port: 8555,
    mnemonic: MNEMONIC,
  },
  istanbulFolder: './coverage',
  istanbulReporter: ['lcov', 'html'],
  skipFiles: [
    "base/ECDSA.sol",
    "base/IERC20.sol",
    "base/SafeMath.sol",
    "Migrations.sol"
  ],
}
