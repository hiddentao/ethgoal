const { createLog, deploy } = require('../../utils/functions')

export const ensureBankIsDeployed = async ({ deployer, artifacts, enableLogger }, settingsAddress) => {
  const log = createLog(enableLogger)

  log('Deploying Bank ...')
  const BankImpl = artifacts.require('./BankImpl')
  const impl = await deploy(deployer, BankImpl, settingsAddress)

  const Bank = artifacts.require('./Bank')
  const bank = await deploy(deployer, Bank, impl.address, settingsAddress)
  log(`... deployed at ${bank.address}`)

  return artifacts.require('./IBank').at(bank.address)
}