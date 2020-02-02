import {
  hdWallet,
  ADDRESS_ZERO,
  sha3,
} from './utils'

const Controller = artifacts.require('./Controller')

contract('Controller', accounts => {
  let controller
  let currentTime
  let fingerprint
  let preparePledge
  let createPledge

  beforeEach(async () => {
    controller = await Controller.new()
    currentTime = await controller.getTime()

    preparePledge = async ({ creator, pot, unit, endDate, judges } = {}) => {
      creator = creator || accounts[0]

      const numJudges = (judges ? judges.length : 3)

      const ret = {
        creator,
        pot: pot || 100,
        unit: unit || ADDRESS_ZERO,
        endDate: endDate || ((await controller.getTime()) + 10000),
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

    createPledge = async ({ creator, pot, unit, endDate, numJudges, signatures }) => {
      return controller.createPledge(
        pot,
        unit,
        endDate,
        numJudges,
        signatures[0] || "0x0",
        signatures[1] || "0x0",
        signatures[2] || "0x0",
        { from: creator }
      )
    }
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

    it('but not if pot is 0', async () => {
      samplePledgeInputs.pot = 0
      await createPledge(samplePledgeInputs).should.be.rejectedWith('pot amount must be non-zero')
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
  })
})