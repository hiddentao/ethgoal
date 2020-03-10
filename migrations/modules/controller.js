const { createLog, deploy } = require('../../utils/functions')

export const ensureControllerIsDeployed = async ({ deployer, artifacts, enableLogger }, settingsAddress) => {
  const log = createLog(enableLogger)

  log('Deploying Controller ...')
  const Controller = artifacts.require('./Controller')
  const controller = await deploy(deployer, Controller, settingsAddress, 604800 /* 7 days expressed as seconds */)
  log(`... deployed at ${controller.address}`)

  return artifacts.require('./IController').at(controller.address)
}