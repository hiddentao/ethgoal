const { createLog, deploy } = require('../../utils/functions')

export const ensureSettingsIsDeployed = async ({ deployer, artifacts, enableLogger }) => {
  const log = createLog(enableLogger)

  log('Deploying Settings ...')
  const SettingsImpl = artifacts.require('./SettingsImpl')
  const impl = await deploy(deployer, SettingsImpl)

  const Settings = artifacts.require('./Settings')
  const settings = await deploy(deployer, Settings, impl.address)
  log(`... deployed at ${settings.address}`)

  return artifacts.require('./ISettings').at(settings.address)
}