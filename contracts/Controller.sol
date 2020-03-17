pragma solidity >=0.6.1;

import "./Ownable.sol";
import "./SafeMath.sol";
import "./IBank.sol";
import "./ECDSA.sol";
import "./IERC20.sol";
import "./SettingsControl.sol";
import "./IController.sol";

contract Controller is Ownable, SettingsControl, IController {
    using SafeMath for *;

    bool private locked;
    uint private judgementPeriod;

    struct Judgement {
        address judge;
        uint pledgeId;
        bool passed;
    }
    mapping (uint => Judgement) private judgements;
    uint private judgementsCount;

    struct Pledge {
        address creator;
        mapping (uint => address) judges;
        mapping (address => bool) isJudge;
        uint numJudges;
        mapping (address => uint) judgements;
        uint numJudgements;
        uint numFailedJudgements;
        uint pot;
        uint balance;
        uint endDate;
    }
    mapping (uint => Pledge) private pledges;
    uint private pledgesCount;

    struct User {
        uint balance;
        mapping (uint => uint) pledgesCreated;
        uint numPledgesCreated;
        uint oldestActiveCreatedPledgeIndex;
        mapping (uint => uint) pledgesJudged;
        uint numPledgesJudged;
        uint oldestActiveJudgedPledgeIndex;
    }
    mapping (address => User) private users;

    event NewPledge(uint indexed pledgeId);
    event NewJudgement(uint indexed judgementId);
    event Withdraw(address indexed caller);
    event Locked(address indexed caller);
    event Unlocked(address indexed caller);

    modifier canJudge(uint _pledgeId) {
        // ensure contract is not locked
        require(!locked, 'contract locked');
        // ensure that pledge is ready to be judged
        require(isPledgeJudgeable(_pledgeId), 'not judgeable');
        // ensure the caller is a judge
        require(pledges[_pledgeId].isJudge[msg.sender], 'must be a judge');
        // ensure that user hasn't already judged
        require(0 == pledges[_pledgeId].judgements[msg.sender], 'already judged');
        _;
    }

    modifier canCreate {
        // ensure contract is not locked
        require(!locked, 'contract locked');
        _;
    }

    constructor (address _settings, uint _judgementPeriod) public SettingsControl(_settings) Ownable() {
        judgementPeriod = _judgementPeriod;
    }

    function createPledge(
      uint _potAmount,
      uint _endDate,
      uint _numJudges,
      bytes memory _judgeSig0,
      bytes memory _judgeSig1,
      bytes memory _judgeSig2
    ) public override canCreate returns (uint) {
        require(_numJudges >= 1, 'atleast 1 judge needed');
        require(_numJudges <= 3, 'max 3 judges allowed');
        require(_endDate > now, 'end date must be in future');
        require(_potAmount >= 1000000000, 'pot amount must be atleast 1 gwei');

        // inc. counter (pledge ids start from 1)
        pledgesCount += 1;

        uint pledgeId = pledgesCount;

        // create pledge
        pledges[pledgeId].creator = msg.sender;
        pledges[pledgeId].endDate = _endDate;
        pledges[pledgeId].pot = _potAmount;

        // update user entry for creator
        users[msg.sender].pledgesCreated[users[msg.sender].numPledgesCreated] = pledgeId;
        users[msg.sender].numPledgesCreated += 1;

        // setup judges
        bytes[] memory sigs = new bytes[](3);
        sigs[0] = _judgeSig0;
        sigs[1] = _judgeSig1;
        sigs[2] = _judgeSig2;

        bytes32 fingerPrint = calculatePledgeFingerprint(msg.sender, _potAmount, _endDate, _numJudges);

        for (uint i = 0; i < _numJudges; i += 1) {
          // get judge address
          address judgeAddress = recoverSigner(fingerPrint, sigs[i]);

          // sanity checks
          require(judgeAddress != address(0), 'invalid judge');
          require(judgeAddress != pledges[pledgeId].creator, 'creator cannot be judge');
          require(!pledges[pledgeId].isJudge[judgeAddress], 'duplicate judge found');
          // update pledge
          pledges[pledgeId].numJudges += 1;
          pledges[pledgeId].judges[pledges[pledgeId].numJudges] = judgeAddress;
          pledges[pledgeId].isJudge[judgeAddress] = true;
          // update user entry
          users[judgeAddress].pledgesJudged[users[judgeAddress].numPledgesJudged] = pledgeId;
          users[judgeAddress].numPledgesJudged += 1;
        }

        // take fee from pot
        pledges[pledgeId].balance = _potAmount;

        // do the transfer
        settings().getBank().deposit(msg.sender, _potAmount);

        emit NewPledge(pledgeId);
    }

    function judgePledge(uint _pledgeId, bool _result) public override canJudge(_pledgeId) {
        // inc. counter (judgement ids start from 1)
        judgementsCount += 1;

        uint judgementId = judgementsCount;

        // create a judgement
        Judgement storage j = judgements[judgementId];
        j.judge = msg.sender;
        j.pledgeId = _pledgeId;
        j.passed = _result;

        // mark judgements
        Pledge storage p = pledges[_pledgeId];
        p.judgements[msg.sender] = judgementId;
        p.numJudgements += 1;
        if (!_result) {
            p.numFailedJudgements += 1;
        }


        // if enough negative judgements then close pledge right now
        if (isPledgeFailed(_pledgeId)) {
            payoutPledgePot(_pledgeId);
        }

        emit NewJudgement(judgementId);
    }

    function withdraw () public override {
        updateBalances(msg.sender);
        withdrawBalance(msg.sender);
        emit Withdraw(msg.sender);
    }

    function lock () public override onlyOwner {
        if (!locked) {
            locked = true;
            emit Locked(msg.sender);
        }
    }

    function unlock () public override onlyOwner {
        if (locked) {
            locked = false;
            emit Unlocked(msg.sender);
        }
    }

    /// Read-only functions ///

    function calculatePledgeFingerprint(
      address _creator,
      uint _potAmount,
      uint _endDate,
      uint _numJudges
    ) public override pure returns (bytes32) {
      return keccak256(abi.encodePacked(_creator, _potAmount, _endDate, _numJudges));
    }

    function getPledgeJudge(uint _pledgeId, uint _judgeIndex) public override view returns (address) {
        return pledges[_pledgeId].judges[_judgeIndex];
    }

    function getPledgeJudgement(uint _pledgeId, address _judge) public override view returns (uint) {
        return pledges[_pledgeId].judgements[_judge];
    }

    function isLocked() public override view returns (bool) {
      return locked;
    }

    function getNumPledges() public override view returns (uint) {
      return pledgesCount;
    }

    function getNumJudgements() public override view returns (uint) {
      return judgementsCount;
    }

    function getPledge(uint _index) public override view returns (
        address creator_,
        uint numJudges_,
        uint numJudgements_,
        uint numFailedJudgements_,
        uint pot_,
        uint balance_,
        uint endDate_,
        bool failed_,
        bool withdrawable_,
        bool judgeable_
    ) {
        Pledge storage p = pledges[_index];

        creator_ = p.creator;
        numJudges_ = p.numJudges;
        numJudgements_ = p.numJudgements;
        numFailedJudgements_ = p.numFailedJudgements;
        pot_ = p.pot;
        balance_ = p.balance;
        endDate_ = p.endDate;
        failed_ = isPledgeFailed(_index);
        withdrawable_ = isPledgeWithdrawable(_index);
        judgeable_ = isPledgeJudgeable(_index);
    }

    function getJudgement(uint _index) public override view returns (
        address judge_,
        uint pledgeId_,
        bool passed_
    ) {
        Judgement storage j = judgements[_index];
        judge_ = j.judge;
        pledgeId_ = j.pledgeId;
        passed_ = j.passed;
    }

    function getUser(address _user) public override view returns (
        uint balance_,
        uint numPledgesCreated_,
        uint oldestActiveCreatedPledgeIndex_,
        uint numPledgesJudged_,
        uint oldestActiveJudgedPledgeIndex_
    ) {
        User storage u = users[_user];
        balance_ = calculateUserBalance(_user);
        numPledgesCreated_ = u.numPledgesCreated;
        oldestActiveCreatedPledgeIndex_ = u.oldestActiveCreatedPledgeIndex;
        numPledgesJudged_ = u.numPledgesJudged;
        oldestActiveJudgedPledgeIndex_ = u.oldestActiveJudgedPledgeIndex;
    }

    function isPledgeJudgeable (uint _pledgeId) public override view returns (bool) {
        if (now < pledges[_pledgeId].endDate) {
            return false;
        }

        uint diff = now - pledges[_pledgeId].endDate;

        return (diff >= 0) && (diff <= judgementPeriod);
    }

    function isPledgeWithdrawable (uint _pledgeId) public override view returns (bool) {
        if (now < pledges[_pledgeId].endDate) {
            return false;
        }

        return (now - pledges[_pledgeId].endDate) > judgementPeriod;
    }

    function isPledgeFailed (uint _pledgeId) public override view returns (bool) {
        return (pledges[_pledgeId].numFailedJudgements > (pledges[_pledgeId].numJudges / 2));
    }

    /// Internal functions ///


    function payoutPledgePot(uint _pledgeId) internal {
        Pledge storage p = pledges[_pledgeId];

        // failed?
        if (isPledgeFailed(_pledgeId)) {
            uint judgeReward = p.balance.div(p.numJudges);

            // split amongst judges
            for (uint i = 1; i <= p.numJudges; i += 1) {
                address j = p.judges[i];
                users[j].balance = users[j].balance.add(judgeReward);
            }
        }
        // passed?
        else {
            users[p.creator].balance = users[p.creator].balance.add(p.balance);
        }

        p.balance = 0;
    }

    function withdrawBalance (address _user) internal {
        // checks-effects-interaction pattern for re-entrancy protection
        uint amount = users[_user].balance;
        users[_user].balance = 0;
        settings().getBank().withdraw(_user, amount);
    }


    function updateBalances(address _user) internal {
        User storage u = users[_user];

        for (uint i = u.oldestActiveCreatedPledgeIndex; i < u.numPledgesCreated; i += 1) {
            uint pledgeId = u.pledgesCreated[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && isPledgeWithdrawable(pledgeId)) {
                payoutPledgePot(pledgeId);
                u.oldestActiveCreatedPledgeIndex += 1;
            }
        }

        for (uint i = u.oldestActiveJudgedPledgeIndex; i < u.numPledgesJudged; i += 1) {
            uint pledgeId = u.pledgesJudged[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && isPledgeWithdrawable(pledgeId)) {
                payoutPledgePot(pledgeId);
                u.oldestActiveJudgedPledgeIndex += 1;
            }
        }
    }


    function recoverSigner (
        bytes32 _fingerprint,
        bytes memory sig
    ) internal pure returns (address) {
        bytes32 h = ECDSA.toEthSignedMessageHash(_fingerprint);
        return ECDSA.recover(h, sig);
    }


    function calculateUserBalance(address _user) internal view returns (uint) {
        User storage u = users[_user];

        uint b1 = u.balance;

        for (uint i = u.oldestActiveCreatedPledgeIndex; i < u.numPledgesCreated; i += 1) {
            b1 = b1.add(calculatePledgePayout(u.pledgesCreated[i], _user));
        }

        for (uint j = u.oldestActiveJudgedPledgeIndex; j < u.numPledgesJudged; j += 1) {
            b1 = b1.add(calculatePledgePayout(u.pledgesJudged[j], _user));
        }

        return b1;
    }

    function calculatePledgePayout(uint _pledgeId, address _user) internal view returns (uint) {
        Pledge storage p = pledges[_pledgeId];

        if (p.balance == 0 || !isPledgeWithdrawable(_pledgeId)) {
            return 0;
        }

        if (p.creator != _user && !p.isJudge[_user]) {
            return 0;
        }

        if (isPledgeFailed(_pledgeId)) {
            if (p.creator != _user) {
                return p.balance.div(p.numJudges);
            } else {
                return 0;
            }
        } else {
            if (p.creator != _user) {
                return 0;
            } else {
                return p.balance;
            }
        }
    }
}