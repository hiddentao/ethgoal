const Migrations = artifacts.require("Migrations")
const Controller = artifacts.require("Controller")

module.exports = deployer => {
  deployer.deploy(Migrations)
  deployer.deploy(Controller)
}
