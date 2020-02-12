const Migrations = artifacts.require("Migrations")
const Controller = artifacts.require("Controller")

module.exports = deployer => {
  deployer.deploy(Migrations)
  deployer.deploy(Controller, 1000 /* 0.1% fee */, 604800 /* 7 days judgemenet period */)
}
