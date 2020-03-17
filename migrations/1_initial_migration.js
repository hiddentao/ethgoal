const Migrations = artifacts.require("Migrations")

const { ensureSettingsIsDeployed } = require('./modules/settings')
const { ensureBankIsDeployed } = require('./modules/bank')
const { ensureControllerIsDeployed } = require('./modules/controller')
const { ensureMintableTokenIsDeployed } = require('./modules/mintableToken')
const { ensureDevChaiIsDeployed } = require('./modules/devChai')

module.exports = async (deployer, network) => {
  await deployer.deploy(Migrations)

  const settings = await ensureSettingsIsDeployed({ deployer, artifacts, enableLogger: true })

  const bank = await ensureBankIsDeployed({ deployer, artifacts, enableLogger: true }, settings.address)
  await settings.setBank(bank.address)

  const controller = await ensureControllerIsDeployed({ deployer, artifacts, enableLogger: true }, settings.address)
  await settings.setController(controller.address)

  switch (network) {
    case 'test':
    case 'coverage':
    case 'rinkeby':
      console.log('Setting up for dev chain settings...')

      const mintableToken = await ensureMintableTokenIsDeployed({ deployer, artifacts, enableLogger: true })
      await settings.setPaymentUnit(mintableToken.address)

      const devChai = await ensureDevChaiIsDeployed({ deployer, artifacts, enableLogger: true }, settings.address)
      await settings.setChai(devChai.address)

      break
    case 'mainnet':
      // mainnet
      console.log('Setting up for mainnet settings...')
      await settings.setPaymentUnit('0x6b175474e89094c44da98b954eedeac495271d0f' /* DAI */)
      await settings.setChai('0x06AF07097C9Eeb7fD685c692751D5C66dB49c215')
    default:
      throw new Error('network migration not set!')
  }
}
