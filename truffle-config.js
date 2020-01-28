let mnemonic = 'notset'
let infuraKey = 'notset'

try {
  ; ({ mnemonic, infuraKey } = require('./.deployment.js'))
} catch (err) {
  // nothing to do
}

const HDWalletProvider = require('truffle-hdwallet-provider')

const ProviderEngine = require("web3-provider-engine")
const WebsocketSubprovider = require("web3-provider-engine/subproviders/websocket.js")

const solcVersion = "0.6.1"
const provider = new ProviderEngine()

provider.addProvider(new WebsocketSubprovider({ rpcUrl: "http://localhost:8545" }))

provider.start(err => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
})
/**
 * HACK: Truffle providers should have `send` function, while `ProviderEngine` creates providers with `sendAsync`,
 * but it can be easily fixed by assigning `sendAsync` to `send`.
 */
provider.send = provider.sendAsync.bind(provider)

module.exports = {
  networks: {
    rinkeby: {
      provider: (num_addresses = 1) => new HDWalletProvider(mnemonic, `https://rinkeby.infura.io/v3/${infuraKey}`, 0, num_addresses),
      gasPrice: 50000000000, // 50 gwei,
      network_id: 4,
    },
    test: {
      provider,
      network_id: "*",
      gasPrice: 1000000000      // 1 gwei
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    },
  },

  mocha: {
    reporter: 'spec',
    timeout: 100000,
  },

  compilers: {
    solc: {
      version: solcVersion,
      settings: {
        optimizer: {
          enabled: true
        }
      }
    }
  }
}