import {
  extractEventArgs,
  ADDRESS_ZERO,
} from './utils'

const Controller = artifacts.require('./Controller')

contract('Controller', accounts => {
  let controller

  beforeEach(async () => {
    controller = await Controller.new()
  })

  it('has contract address assigned as bank', async () => {
    await controller.bank().should.eventually.eq(controller.address)
  })

  it('is initially unlocked', async () => {
    await controller.locked().should.eventually.eq(false)
  })

  describe('can be locked / unlocked', () => {
    it('but not just by anyone', async () => {
      await controller.lock({ from: accounts[1] }).should.be.rejectedWith('must be admin')
      await controller.unlock({ from: accounts[1] }).should.be.rejectedWith('must be admin')
    })

    it('by the admin', async () => {
      await controller.lock().should.be.fulfilled
      await controller.locked().should.eventually.eq(true)
      await controller.unlock().should.be.fulfilled
      await controller.locked().should.eventually.eq(false)
    })
  })
})