import {
  hdWallet,
  ADDRESS_ZERO,
  extractEventArgs,
  events,
  web3EvmIncreaseTime,
  gwei,
  wei,
} from './utils'

import { ensureEtherTokenIsDeployed } from '../migrations/utils/etherToken'

const Controller = artifacts.require('./Controller')


contract('Controller', accounts => {
  let controller
  let currentTime
  let etherToken
  let fingerprint
  let preparePledge
  let createPledge
  let feeDivider
  let judgementPeriodSeconds
  let getBalance

  beforeEach(async () => {
    getBalance = async a => wei(await web3.eth.getBalance(a))

    etherToken = await ensureEtherTokenIsDeployed({ artifacts })

    feeDivider = 1000  // fee of 0.1%
    judgementPeriodSeconds = 86400 // 1 day
    controller = await Controller.new(feeDivider, judgementPeriodSeconds)

    const t = await controller.getTime()
    currentTime = parseInt(t.toString())

    preparePledge = async ({ creator, pot, unit, endDate, judges } = {}) => {
      creator = creator || accounts[0]

      const numJudges = (judges ? judges.length : 3)

      const ret = {
        creator,
        pot: pot || gwei(1).toNumber(),
        unit: unit || ADDRESS_ZERO,
        endDate: endDate || (currentTime + 10000),
        numJudges,
      }

      fingerprint = await controller.calculatePledgeFingerprint(
        ret.creator, ret.pot, ret.unit, ret.endDate, numJudges
      )

      ret.signatures = (judges || accounts.slice(1, 4)).map(j => {
        return hdWallet.sign({ address: j, data: fingerprint })
      })

      return ret
    }

    createPledge = async ({ creator, pot, unit, endDate, numJudges, signatures } = {}, attrs = {}) => {
      return controller.createPledge(
        pot,
        unit,
        endDate,
        numJudges,
        signatures[0] || "0x0",
        signatures[1] || "0x0",
        signatures[2] || "0x0",
        Object.assign({ from: creator }, attrs)
      )
    }
  })

  it('has contract address assigned as bank', async () => {
    await controller.getBank().should.eventually.eq(controller.address)
  })

  it('is initially unlocked', async () => {
    await controller.isLocked().should.eventually.eq(false)
  })

  describe('can be locked / unlocked', () => {
    it('but not just by anyone', async () => {
      await controller.lock({ from: accounts[1] }).should.be.rejectedWith('Ownable: caller is not the owner')
      await controller.unlock({ from: accounts[1] }).should.be.rejectedWith('Ownable: caller is not the owner')
    })

    it('by the admin', async () => {
      await controller.lock().should.be.fulfilled
      await controller.isLocked().should.eventually.eq(true)
      await controller.unlock().should.be.fulfilled
      await controller.isLocked().should.eventually.eq(false)
    })
  })

  describe('a pledge can be created', () => {
    let samplePledgeInputs

    beforeEach(async () => {
      samplePledgeInputs = await preparePledge()
    })

    it('but not when contract is locked', async () => {
      await controller.lock()
      await createPledge(samplePledgeInputs).should.be.rejectedWith('contract locked')
    })

    it('but not if number of judges is less than 3', async () => {
      samplePledgeInputs.numJudges = 0
      await createPledge(samplePledgeInputs).should.be.rejectedWith('atleast 1 judge needed')
    })

    it('but not if number of judges is more than 3', async () => {
      samplePledgeInputs.numJudges = 4
      await createPledge(samplePledgeInputs).should.be.rejectedWith('max 3 judges allowed')
    })

    it('but not if end date is not in the future', async () => {
      samplePledgeInputs.endDate = ~~(Date.now() / 1000)
      await createPledge(samplePledgeInputs).should.be.rejectedWith('end date must be in future')
    })

    it('but not if pot is less than 1 gwei', async () => {
      samplePledgeInputs.pot = gwei(1).sub(1).toNumber()
      await createPledge(samplePledgeInputs).should.be.rejectedWith('pot amount must be atleast 1 gwei')
    })

    it('but not if signature is corrupted', async () => {
      samplePledgeInputs.signatures[0] = '0x01'
      await createPledge(samplePledgeInputs).should.be.rejectedWith('invalid judge')
    })

    it('but not if a judge is duplicated', async () => {
      samplePledgeInputs.signatures[2] = samplePledgeInputs.signatures[0]
      await createPledge(samplePledgeInputs).should.be.rejectedWith('duplicate judge found')
    })

    it('but not if creator is a judge', async () => {
      samplePledgeInputs.signatures[1] = hdWallet.sign({ address: samplePledgeInputs.creator, data: fingerprint })
      await createPledge(samplePledgeInputs).should.be.rejectedWith('creator cannot be judge')
    })

    it('but not if creator balance is low', async () => {
      // pot = 100, so let's pass 99 ;)
      await createPledge(samplePledgeInputs, { value: samplePledgeInputs.pot - 1 }).should.be.rejectedWith('not enough ETH')
    })

    it('if all checks pass', async () => {
      // now we match the pot
      await createPledge(samplePledgeInputs, { value: samplePledgeInputs.pot }).should.be.fulfilled
    })
  })

  describe('when pledges are created', () => {
    let pledgeInputs
    let result

    beforeEach(async () => {
      pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [ accounts[1], accounts[2] ],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [ accounts[2] ],
        }),
      ])

      result = await Promise.all(pledgeInputs.map(p => createPledge(p, { from: p.creator, value: p.pot })))
    })

    it('has the correct initial data', async () => {
      await controller.getNumPledges().should.eventually.eq(2)
      await controller.getNumJudgements().should.eventually.eq(0)

      // first pledge
      let c = await controller.getPledge(1)
      expect(c.creator).to.eq(accounts[0])
      expect(c.numJudges.toNumber()).to.eq(pledgeInputs[0].numJudges)
      expect(c.numJudgements.toNumber()).to.eq(0)
      expect(c.numFailedJudgements.toNumber()).to.eq(0)
      expect(c.pot.toNumber()).to.eq(pledgeInputs[0].pot)
      expect(c.unit).to.eq(pledgeInputs[0].unit)
      expect(c.endDate.toNumber()).to.eq(pledgeInputs[0].endDate)
      await controller.getPledgeJudge(1, 0).should.eventually.eq(accounts[1])
      await controller.getPledgeJudge(1, 1).should.eventually.eq(accounts[2])
      const fee1 = c.pot / feeDivider
      expect(c.balance.toNumber()).to.eq(c.pot - fee1)

      await controller.pledgeJudgeable(1).should.eventually.eq(false)
      await controller.pledgeWithdrawable(1).should.eventually.eq(false)

      // second pledge
      c = await controller.getPledge(2)
      expect(c.creator).to.eq(accounts[1])
      expect(c.numJudges.toNumber()).to.eq(pledgeInputs[1].numJudges)
      expect(c.numJudgements.toNumber()).to.eq(0)
      expect(c.numFailedJudgements.toNumber()).to.eq(0)
      expect(c.pot.toNumber()).to.eq(pledgeInputs[1].pot)
      expect(c.unit).to.eq(pledgeInputs[1].unit)
      expect(c.endDate.toNumber()).to.eq(pledgeInputs[1].endDate)
      await controller.getPledgeJudge(2, 0).should.eventually.eq(accounts[2])
      const fee2 = c.pot / feeDivider
      expect(c.balance.toNumber()).to.eq(c.pot - fee2)

      await controller.pledgeJudgeable(2).should.eventually.eq(false)
      await controller.pledgeWithdrawable(2).should.eventually.eq(false)

      // bank
      await controller.getUserBalance(controller.address, ADDRESS_ZERO).should.eventually.eq(fee1 + fee2)

      // accounts[0]
      c = await controller.getUser(accounts[0])
      expect(c.numPledgesCreated.toNumber()).to.eq(1)
      expect(c.oldestActiveCreatedPledgeIndex.toNumber()).to.eq(0)
      expect(c.numPledgesJudged.toNumber()).to.eq(0)
      expect(c.oldestActiveJudgedPledgeIndex.toNumber()).to.eq(0)

      // accounts[1]
      c = await controller.getUser(accounts[1])
      expect(c.numPledgesCreated.toNumber()).to.eq(1)
      expect(c.oldestActiveCreatedPledgeIndex.toNumber()).to.eq(0)
      expect(c.numPledgesJudged.toNumber()).to.eq(1)
      expect(c.oldestActiveJudgedPledgeIndex.toNumber()).to.eq(0)

      // accounts[2]
      c = await controller.getUser(accounts[2])
      expect(c.numPledgesCreated.toNumber()).to.eq(0)
      expect(c.oldestActiveCreatedPledgeIndex.toNumber()).to.eq(0)
      expect(c.numPledgesJudged.toNumber()).to.eq(2)
      expect(c.oldestActiveJudgedPledgeIndex.toNumber()).to.eq(0)
    })

    it('emits events', async () => {
      let { pledgeId: pledgeId1 } = extractEventArgs(result[0], events.NewPledge)
      expect(pledgeId1).to.eq('1')

      let { pledgeId: pledgeId2 } = extractEventArgs(result[1], events.NewPledge)
      expect(pledgeId2).to.eq('2')
    })

    describe('they can be judged', () => {
      it('but not when contract is locked', async () => {
        await controller.lock()
        await controller.judgePledge(1, false).should.be.rejectedWith('contract locked')
      })

      it('but not by the creator', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[0] }).should.be.rejectedWith('must be a judge')
      })

      it('but not by a random person', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[4] }).should.be.rejectedWith('must be a judge')
      })

      it('but not if pledge is not yet judgeable', async () => {
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('not judgeable')
      })

      it('but not if pledge is past the judgement phase', async () => {
        await web3EvmIncreaseTime(web3, 86400 * 14 + 101 /* ~ 2 weeks after end time */)

        await controller.pledgeJudgeable(1).should.eventually.eq(false)
        await controller.pledgeWithdrawable(1).should.eventually.eq(true)

        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('not judgeable')
      })

      it('but not if sender has already judged', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('already judged')
      })

      it('and the verdict can be positive', async () => {
        await web3EvmIncreaseTime(web3, 100)

        await controller.pledgeJudgeable(1).should.eventually.eq(true)
        await controller.pledgeWithdrawable(1).should.eventually.eq(false)

        await controller.judgePledge(1, true, { from: accounts[1] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements.toNumber()).to.eq(1)
        expect(p.numFailedJudgements.toNumber()).to.eq(0)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)

        // check judgement
        await controller.getNumJudgements().should.eventually.eq(1)
        const j = await controller.getJudgement(1)
        expect(j.judge).to.eq(accounts[1])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(true)
      })

      it('and the verdict can be negative', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements.toNumber()).to.eq(1)
        expect(p.numFailedJudgements.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(1)

        // check judgement
        await controller.getNumJudgements().should.eventually.eq(1)
        const j = await controller.getJudgement(1)
        expect(j.judge).to.eq(accounts[2])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(false)
      })

      it('and if a clear majority is not negative then the pledge has not failed', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, true, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements.toNumber()).to.eq(2)
        expect(p.numFailedJudgements.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(2)

        await controller.pledgeFailed(1).should.eventually.eq(false)

        // check judgements
        await controller.getNumJudgements().should.eventually.eq(2)
        let j = await controller.getJudgement(1)
        expect(j.judge).to.eq(accounts[1])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(true)
        j = await controller.getJudgement(2)
        expect(j.judge).to.eq(accounts[2])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(false)
      })

      it('and if a clear majority is negative then the pledge has failed and the pot gets paid out', async () => {
        const initialBalance = (await controller.getPledge(1)).balance.toNumber()

        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements.toNumber()).to.eq(2)
        expect(p.numFailedJudgements.toNumber()).to.eq(2)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(2)

        await controller.pledgeFailed(1).should.eventually.eq(true)

        // check judgements
        await controller.getNumJudgements().should.eventually.eq(2)
        let j = await controller.getJudgement(1)
        expect(j.judge).to.eq(accounts[1])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(false)
        j = await controller.getJudgement(2)
        expect(j.judge).to.eq(accounts[2])
        expect(j.pledgeId.toNumber()).to.eq(1)
        expect(j.passed).to.eq(false)

        // check the balances
        expect(p.balance.toNumber()).to.eq(0)

        const payout = initialBalance / p.numJudges.toNumber()
        await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(0)
        await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(payout)
        await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(payout)
      })

      it('and if there is just one judge then that judge gets the whole payout if pledge fails', async () => {
        const initialBalance = (await controller.getPledge(2)).balance.toNumber()

        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(2)
        expect(p.numJudgements.toNumber()).to.eq(1)
        expect(p.numFailedJudgements.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(2, accounts[2]).should.eventually.eq(1)

        await controller.pledgeFailed(2).should.eventually.eq(true)

        // // check judgements
        await controller.getNumJudgements().should.eventually.eq(1)
        let j = await controller.getJudgement(1)
        expect(j.judge).to.eq(accounts[2])
        expect(j.pledgeId.toNumber()).to.eq(2)
        expect(j.passed).to.eq(false)

        // // check the balances
        expect(p.balance.toNumber()).to.eq(0)

        await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(0)
        await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(initialBalance)
      })
    })
  })

  describe('complex balance calculations are possible, e.g', () => {
    it('when user passed 1 pledge, failed another, and is judging another that has failed but in different unit', async () => {
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[0] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[1] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[2] })

      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[0] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[1] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[2] })

      const pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      await Promise.all(pledgeInputs.map(p => createPledge(p, {
        from: p.creator,
        value: (p.unit === ADDRESS_ZERO ? p.pot : 0)
      })))

      // get balances
      const pledge1Balance = (await controller.getPledge(1)).balance.toNumber()
      const pledge2Balance = (await controller.getPledge(2)).balance.toNumber()
      const pledge3Balance = (await controller.getPledge(3)).balance.toNumber()

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // (almost) fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(0)

      await controller.getUserBalance(accounts[1], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(0)

      await controller.getUserBalance(accounts[2], etherToken.address).should.eventually.eq(pledge2Balance)
      await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(0)

      // now properly fail the third pledge
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // now check balance
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(pledge1Balance)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2)

      await controller.getUserBalance(accounts[1], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(0)

      await controller.getUserBalance(accounts[2], etherToken.address).should.eventually.eq(pledge2Balance)
      await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2)
    })

    it('when user passed 1 pledge, failed another, and is judging another that has failed but in different unit', async () => {
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[0] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[1] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[2] })

      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[0] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[1] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[2] })

      const pledgeInputs1 = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      await Promise.all(pledgeInputs1.map(p => createPledge(p, {
        from: p.creator,
        value: (p.unit === ADDRESS_ZERO ? p.pot : 0)
      })))

      // get balances
      const pledge1Balance = (await controller.getPledge(1)).balance.toNumber()
      const pledge2Balance = (await controller.getPledge(2)).balance.toNumber()
      const pledge3Balance = (await controller.getPledge(3)).balance.toNumber()

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // (almost) fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      const t = await controller.getTime()
      currentTime = parseInt(t.toString())

      const pledgeInputs2 = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [accounts[0]],
        }),
        preparePledge({
          creator: accounts[2],
          pot: gwei(50).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[1]],
        }),
      ])

      await Promise.all(pledgeInputs2.map(p => createPledge(p, {
        from: p.creator,
        value: (p.unit === ADDRESS_ZERO ? p.pot : 0)
      })))

      // get balances
      const pledge4Balance = (await controller.getPledge(4)).balance.toNumber()
      const pledge5Balance = (await controller.getPledge(5)).balance.toNumber()
      const pledge6Balance = (await controller.getPledge(6)).balance.toNumber()

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)

      // fail the fifth pledge
      await controller.judgePledge(5, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(pledge1Balance)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2 + pledge5Balance)

      await controller.getUserBalance(accounts[1], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(0)

      await controller.getUserBalance(accounts[2], etherToken.address).should.eventually.eq(pledge2Balance)
      await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2)

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // now check balances again
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(pledge1Balance)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2 + pledge5Balance + pledge4Balance)

      await controller.getUserBalance(accounts[1], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[1], ADDRESS_ZERO).should.eventually.eq(0)

      await controller.getUserBalance(accounts[2], etherToken.address).should.eventually.eq(pledge2Balance + pledge6Balance)
      await controller.getUserBalance(accounts[2], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2)
    })
  })

  describe('withdrawals are possible', () => {
    it('and balances reflect updated values afterwards', async () => {
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[0] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[1] })
      await etherToken.deposit({ value: gwei(5000).toNumber(), from: accounts[2] })

      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[0] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[1] })
      await etherToken.approve(controller.address, gwei(200).toNumber(), { from: accounts[2] })

      const pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          unit: etherToken.address,
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          unit: ADDRESS_ZERO,
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      await Promise.all(pledgeInputs.map(p => createPledge(p, {
        from: p.creator,
        value: (p.unit === ADDRESS_ZERO ? p.pot : 0)
      })))

      // get balances
      const pledge1Balance = (await controller.getPledge(1)).balance.toNumber()
      const pledge2Balance = (await controller.getPledge(2)).balance.toNumber()
      const pledge3Balance = (await controller.getPledge(3)).balance.toNumber()

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // (almost) fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(0)

      // now properly fail the third pledge
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // check balances
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(pledge1Balance)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(pledge3Balance / 2)

      // now withdraw
      const pre1 = (await etherToken.balanceOf(accounts[0])).toNumber()
      await controller.withdraw(etherToken.address, { from: accounts[0] })
      const post1 = (await etherToken.balanceOf(accounts[0])).toNumber()
      expect(post1 - pre1).to.eq(pledge1Balance)

      const pre2 = (await getBalance(accounts[0]))
      const ret = await controller.withdraw(ADDRESS_ZERO, { from: accounts[0] })
      const gasUsed = gwei(ret.receipt.gasUsed).toWei()
      const post2 = (await getBalance(accounts[0]))
      expect(post2.sub(pre2).add(gasUsed).toNumber()).to.eq(pledge3Balance / 2)

      // now check balances again
      await controller.getUserBalance(accounts[0], etherToken.address).should.eventually.eq(0)
      await controller.getUserBalance(accounts[0], ADDRESS_ZERO).should.eventually.eq(0)
    })
  })
})