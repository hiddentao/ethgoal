require('./utils')

import { ensureSettingsIsDeployed } from '../migrations/modules/settings'
import { ensureMintableTokenIsDeployed } from '../migrations/modules/mintableToken'
import { ensureDevChaiIsDeployed } from '../migrations/modules/devChai'

contract('Dev chai', accounts => {
  let settings
  let mintableToken
  let chai

  beforeEach(async () => {
    settings = await ensureSettingsIsDeployed({ artifacts })
    mintableToken = await ensureMintableTokenIsDeployed({ artifacts }, settings.address)
    await settings.setPaymentUnit(mintableToken.address)

    chai = await ensureDevChaiIsDeployed({ artifacts }, settings.address)
  })

  describe('allows for deposits', () => {
    it('but need token authorization', async () => {
      await chai.join(accounts[0], 1).should.be.rejectedWith('exceeds allowance')
    })

    it('but need balance', async () => {
      await mintableToken.approve(chai.address, 2)
      await chai.join(accounts[0], 2).should.be.rejectedWith('exceeds balance')
    })

    it('and they work', async () => {
      await mintableToken.mint(1)
      await mintableToken.approve(chai.address, 1)
      await chai.join(accounts[0], 1).should.be.fulfilled
    })

    it('and adds interest as soon as balance received', async () => {
      await mintableToken.balanceOf(chai.address).should.eventually.eq(0)

      await mintableToken.mint(100)

      await mintableToken.approve(chai.address, 1)
      await chai.join(accounts[0], 1)

      await mintableToken.balanceOf(chai.address).should.eventually.eq(6)

      await mintableToken.approve(chai.address, 2)
      await chai.join(accounts[0], 2)

      await mintableToken.balanceOf(chai.address).should.eventually.eq(13)
      await mintableToken.balanceOf(accounts[0]).should.eventually.eq(97)
    })
  })

  describe('allow for withdrawals', () => {
    beforeEach(async () => {
      await mintableToken.mint(100)
      await mintableToken.approve(chai.address, 100)
      await chai.join(accounts[0], 100)
      await mintableToken.balanceOf(chai.address).should.eventually.eq(105)
    })

    it('but not more than you put in', async () => {
      await chai.draw(accounts[0], 106).should.be.rejectedWith('not enough balance')
    })

    it('can withdraw full balance', async () => {
      await chai.draw(accounts[0], 105).should.be.fulfilled
      await mintableToken.balanceOf(chai.address).should.eventually.eq(0)
      await mintableToken.balanceOf(accounts[0]).should.eventually.eq(105)
    })

    it('can withdraw partial balance', async () => {
      await chai.draw(accounts[0], 52).should.be.fulfilled
      await mintableToken.balanceOf(chai.address).should.eventually.eq(53)
      await mintableToken.balanceOf(accounts[0]).should.eventually.eq(52)
    })
  })

  describe('allow for fetching current balance', () => {
    beforeEach(async () => {
      await mintableToken.mint(100)
      await mintableToken.approve(chai.address, 100)
      await chai.join(accounts[0], 100)
      await mintableToken.balanceOf(chai.address).should.eventually.eq(105)
    })

    it('works', async () => {
      const ret = await chai.dai(accounts[0])
      expect(ret.receipt.status).to.eq(true)
    })
  })
})
