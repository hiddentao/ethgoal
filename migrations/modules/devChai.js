const { createLog, deploy } = require('../../utils/functions')

export const ensureDevChaiIsDeployed = async ({ deployer, artifacts, logger }, settingsAddress) => {
  const log = createLog(logger)

  log('Deploying DevChai ...')
  const DevChai = artifacts.require('./DevChai')
  const devChai = await deploy(deployer, DevChai, settingsAddress)
  log(`... deployed at ${devChai.address}`)

  return artifacts.require('./IChai').at(devChai.address)
}