const Migrations = artifacts.require("Migrations")
const ControllerImpl = artifacts.require("ControllerImpl")
const Controller = artifacts.require("Controller")

module.exports = async deployer => {
  await deployer.deploy(Migrations)
  const controllerImpl = await deployer.deploy(ControllerImpl)
  await deployer.deploy(Controller, controllerImpl.address, 1000 /* 0.1% fee */, 604800 /* 7 days judgemenet period */)
}
