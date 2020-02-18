pragma solidity >=0.6.1;

import "./base/Ownable.sol";
import "./base/SafeMath.sol";
import "./base/ECDSA.sol";
import "./base/IERC20.sol";

contract Controller is Ownable {
    using SafeMath for *;

    address private bank;
    bool private locked;
    uint private fee;
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
        address unit;
        uint endDate;
    }
    mapping (uint => Pledge) private pledges;
    uint private pledgesCount;

    struct User {
        mapping (address => uint) balances;
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

    constructor (uint _fee, uint _judgementPeriod) public {
        bank = address(this);
        fee = _fee;
        judgementPeriod = _judgementPeriod;
    }

    modifier canJudge(uint _pledgeId) {
        // ensure contract is not locked
        require(!locked, 'contract locked');
        // ensure that pledge is ready to be judged
        require(pledgeJudgeable(_pledgeId), 'not judgeable');
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

    function createPledge(
      uint _potAmount,
      address _potUnit,
      uint _endDate,
      uint _numJudges,
      bytes memory _judgeSig0,
      bytes memory _judgeSig1,
      bytes memory _judgeSig2
    ) public payable canCreate returns (uint) {
        require(_numJudges >= 1, 'atleast 1 judge needed');
        require(_numJudges <= 3, 'max 3 judges allowed');
        require(_endDate > now, 'end date must be in future');
        require(_potAmount >= 1000000000, 'pot amount must be atleast 1 gwei');

        // inc. counter (pledge ids start from 1)
        pledgesCount += 1;

        uint pledgeId = pledgesCount;

        // create pledge
        pledges[pledgeId].creator = msg.sender;
        pledges[pledgeId].unit = _potUnit;
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

        bytes32 fingerPrint = calculatePledgeFingerprint(msg.sender, _potAmount, _potUnit, _endDate, _numJudges);

        for (uint i = 0; i < _numJudges; i += 1) {
          // get judge address
          address judgeAddress = recoverSigner(fingerPrint, sigs[i]);

          // sanity checks
          require(judgeAddress != address(0), 'invalid judge');
          require(judgeAddress != pledges[pledgeId].creator, 'creator cannot be judge');
          require(!pledges[pledgeId].isJudge[judgeAddress], 'duplicate judge found');
          // update pledge
          pledges[pledgeId].judges[pledges[pledgeId].numJudges] = judgeAddress;
          pledges[pledgeId].numJudges += 1;
          pledges[pledgeId].isJudge[judgeAddress] = true;
          // update user entry
          users[judgeAddress].pledgesJudged[users[judgeAddress].numPledgesJudged] = pledgeId;
          users[judgeAddress].numPledgesJudged += 1;
        }

        // take fee from pot
        users[bank].balances[_potUnit] = users[bank].balances[_potUnit].add(_potAmount.div(fee));
        pledges[pledgeId].balance = _potAmount.sub(_potAmount.div(fee));

        // finally, do the transfer
        if (_potUnit != address(0)) {
            IERC20 tkn = IERC20(_potUnit);
            require(tkn.balanceOf(msg.sender) >= _potAmount, 'not enough token balance');
            require(tkn.allowance(msg.sender, bank) >= _potAmount, 'need approval');
            require(IERC20(_potUnit).transferFrom(msg.sender, bank, _potAmount), 'transfer failed');
        } else {
            require(msg.value >= _potAmount, 'not enough ETH');
        }

        emit NewPledge(pledgeId);
    }

    function judgePledge(uint _pledgeId, bool _result) public canJudge(_pledgeId) {
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
        if (pledgeFailed(_pledgeId)) {
            payoutPledgePot(_pledgeId);
        }

        emit NewJudgement(judgementId);
    }

    function withdraw (address _unit) public {
        updateBalances(msg.sender);
        withdrawBalance(msg.sender, msg.sender, _unit);
        emit Withdraw(msg.sender);
    }

    function withdrawAdminFee (address _unit) public onlyOwner {
        withdrawBalance(bank, msg.sender, _unit);
    }

    function lock () public onlyOwner {
        if (!locked) {
            locked = true;
            emit Locked(msg.sender);
        }
    }

    function unlock () public onlyOwner {
        if (locked) {
            locked = false;
            emit Unlocked(msg.sender);
        }
    }

    /// Read-only functions ///

    function pledgeJudgeable (uint _pledgeId) public view returns (bool) {
        if (now < pledges[_pledgeId].endDate) {
            return false;
        }

        uint diff = now - pledges[_pledgeId].endDate;

        return (diff >= 0) && (diff <= judgementPeriod);
    }

    function pledgeWithdrawable (uint _pledgeId) public view returns (bool) {
        if (now < pledges[_pledgeId].endDate) {
            return false;
        }

        return (now - pledges[_pledgeId].endDate) > judgementPeriod;
    }

    function pledgeFailed (uint _pledgeId) public view returns (bool) {
        return (pledges[_pledgeId].numFailedJudgements > (pledges[_pledgeId].numJudges / 2));
    }

    function calculatePledgeFingerprint(
      address _creator,
      uint _potAmount,
      address _potUnit,
      uint _endDate,
      uint _numJudges
    ) public pure returns (bytes32) {
      return keccak256(abi.encodePacked(_creator, _potAmount, _potUnit, _endDate, _numJudges));
    }

    function getTime() public view returns (uint) {
        return now;
    }

    function getUserBalance(address _user, address _unit) public view returns (uint) {
        User storage u = users[_user];

        uint b1 = u.balances[_unit];

        for (uint i = u.oldestActiveCreatedPledgeIndex; i < u.numPledgesCreated; i += 1) {
            b1 = b1.add(calculatePledgePayout(u.pledgesCreated[i], _user, _unit));
        }

        for (uint j = u.oldestActiveJudgedPledgeIndex; j < u.numPledgesJudged; j += 1) {
            b1 = b1.add(calculatePledgePayout(u.pledgesJudged[j], _user, _unit));
        }

        return b1;
    }

    function getPledgeJudge(uint _pledgeId, uint _judgeIndex) public view returns (address) {
        return pledges[_pledgeId].judges[_judgeIndex];
    }

    function getPledgeJudgement(uint _pledgeId, address _judge) public view returns (uint) {
        return pledges[_pledgeId].judgements[_judge];
    }

    function isLocked() public view returns (bool) {
      return locked;
    }

    function getBank() public view returns (address) {
      return bank;
    }

    function getNumPledges() public view returns (uint) {
      return pledgesCount;
    }

    function getNumJudgements() public view returns (uint) {
      return judgementsCount;
    }

    function getPledge(uint _index) public view returns (
        address creator,
        uint numJudges,
        uint numJudgements,
        uint numFailedJudgements,
        uint pot,
        uint balance,
        address unit,
        uint endDate
    ) {
        Pledge storage p = pledges[_index];

        creator = p.creator;
        numJudges = p.numJudges;
        numJudgements = p.numJudgements;
        numFailedJudgements = p.numFailedJudgements;
        pot = p.pot;
        balance = p.balance;
        unit = p.unit;
        endDate = p.endDate;
    }

    function getJudgement(uint _index) public view returns (
        address judge,
        uint pledgeId,
        bool passed
    ) {
        Judgement storage j = judgements[_index];
        judge = j.judge;
        pledgeId = j.pledgeId;
        passed = j.passed;
    }

    function getUser(address _user) public view returns (
        uint numPledgesCreated,
        uint oldestActiveCreatedPledgeIndex,
        uint numPledgesJudged,
        uint oldestActiveJudgedPledgeIndex
    ) {
        User storage u = users[_user];
        numPledgesCreated = u.numPledgesCreated;
        oldestActiveCreatedPledgeIndex = u.oldestActiveCreatedPledgeIndex;
        numPledgesJudged = u.numPledgesJudged;
        oldestActiveJudgedPledgeIndex = u.oldestActiveJudgedPledgeIndex;
    }


    /// Internal functions ///


    function payoutPledgePot(uint _pledgeId) internal {
        Pledge storage p = pledges[_pledgeId];

        // failed?
        if (pledgeFailed(_pledgeId)) {
            uint judgeReward = p.balance.div(p.numJudges);

            // split amongst judges
            for (uint i = 0; i < p.numJudges; i += 1) {
                address j = p.judges[i];
                users[j].balances[p.unit] = users[j].balances[p.unit].add(judgeReward);
            }
        }
        // passed?
        else {
            users[p.creator].balances[p.unit] = users[p.creator].balances[p.unit].add(p.balance);
        }

        p.balance = 0;
    }

    function withdrawBalance (address _user, address payable _recipient, address _unit) internal {
        // checks-effects-interaction pattern for re-entrancy protection
        uint amount = users[_user].balances[_unit];
        users[_user].balances[_unit] = 0;

        if (_unit == address(0)) {
            (bool success, ) = _recipient.call.value(amount)("");
            require(success, "transfer failed");
        } else {
            IERC20(_unit).transfer(_recipient, amount);
        }
    }


    function updateBalances(address _user) internal {
        User storage u = users[_user];

        for (uint i = u.oldestActiveCreatedPledgeIndex; i < u.numPledgesCreated; i += 1) {
            uint pledgeId = u.pledgesCreated[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && pledgeWithdrawable(pledgeId)) {
                payoutPledgePot(pledgeId);
                u.oldestActiveCreatedPledgeIndex += 1;
            }
        }

        for (uint i = u.oldestActiveJudgedPledgeIndex; i < u.numPledgesJudged; i += 1) {
            uint pledgeId = u.pledgesJudged[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && pledgeWithdrawable(pledgeId)) {
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


    function calculatePledgePayout(uint _pledgeId, address _user, address _unit) internal view returns (uint) {
        Pledge storage p = pledges[_pledgeId];

        if (p.balance == 0 || p.unit != _unit || !pledgeWithdrawable(_pledgeId)) {
            return 0;
        }

        if (p.creator != _user && !p.isJudge[_user]) {
            return 0;
        }

        if (pledgeFailed(_pledgeId)) {
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