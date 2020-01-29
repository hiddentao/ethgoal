pragma solidity >=0.6.1;

import "./ECDSA.sol";
import "./IERC20.sol";

contract Controller {
    address public bank;
    address public admin;
    bool public locked;

    struct Judgement {
        uint pledgeId;
        bool passed;
    }
    mapping (uint => Judgement) public judgements;
    uint public numJudgements;

    struct Pledge {
        address creator;
        mapping (uint => address) judges;
        mapping (address => bool) isJudge;
        uint numJudges;
        mapping (address => uint) judgements;
        uint numJudgements;
        uint numFailedJudgements;
        uint amount;
        uint pot;
        address unit;
        uint endDate;
    }
    mapping (uint => Pledge) public pledges;
    uint public numPledges;

    struct User {
        mapping (address => uint) balances;
        mapping (uint => uint) pledgesCreated;
        uint numPledgesCreated;
        uint latestActiveCreatedPledge;
        mapping (uint => uint) pledgesJudged;
        uint numPledgesJudged;
        uint latestActiveJudgedPledge;
    }
    mapping (address => User) public users;


    modifier canJudge(uint _pledgeId) {
        // ensure that pledge is ready to be judged
        require(pledges[_pledgeId].endDate <= now, 'pledge still active');
        // ensure that pledge is still in judgement phase
        require(pledgeCanBeJudged(_pledgeId), 'already ended');
        // ensure the caller is a judge
        require(pledges[_pledgeId].isJudge[msg.sender], 'must be a judge');
        _;
    }

    modifier canClose (uint _pledgeId) {
        require(now - pledges[_pledgeId].endDate >= 2 weeks, 'not yet ended');
        _;
    }

    modifier canCreate {
        require(!locked, 'contract locked');
        _;
    }

    modifier isAdmin () {
        require(msg.sender == admin, 'must be admin');
        _;
    }

    constructor () public {
        admin = msg.sender;
        bank = address(this);
    }

    function createPledge(
      uint _potAmount,
      address _potUnit,
      uint _endDate,
      uint _numJudges,
      string memory _msgPrefix,
      bytes memory _judgeSig0,
      bytes memory _judgeSig1,
      bytes memory _judgeSig2
    ) public payable canCreate returns (uint) {
        require(_numJudges <= 3, 'no more than 3 judges allowed');
        require(_endDate > now, 'end date must be in future');
        require(_potAmount > 0, 'pot amount must be non-zero');

        // create pledge
        pledges[numPledges].creator = msg.sender;
        pledges[numPledges].unit = _potUnit;
        pledges[numPledges].endDate = _endDate;

        // update user entry for creator
        users[msg.sender].pledgesCreated[users[msg.sender].numPledgesCreated] = numPledges;
        users[msg.sender].numPledgesCreated += 1;

        // setup judges
        bytes[] memory sigs = new bytes[](_numJudges);
        sigs[0] = _judgeSig0;
        sigs[1] = _judgeSig1;
        sigs[2] = _judgeSig2;

        bytes32 msgHash = calculateMsgHash(_msgPrefix, msg.sender, _potAmount, _potUnit, _endDate);

        for (uint i = 0; i < _numJudges; i += 1) {
          // get judge address
          address judgeAddress = ECDSA.recover(msgHash, sigs[i]);
          // sanity checks
          require(judgeAddress != address(0), 'invalid judge');
          require(judgeAddress != pledges[numPledges].creator, 'creator cannot be judge');
          require(!pledges[numPledges].isJudge[judgeAddress], 'duplicate judge not allowed');
          // update pledge
          pledges[numPledges].judges[pledges[numPledges].numJudges] = judgeAddress;
          pledges[numPledges].numJudges += 1;
          pledges[numPledges].isJudge[judgeAddress] = true;
          // update user entry
          users[judgeAddress].pledgesJudged[users[judgeAddress].numPledgesJudged] = numPledges;
          users[judgeAddress].numPledgesJudged += 1;
        }

        // calculate fee from pot
        users[bank].balances[_potUnit] = _potAmount / 1000; // 0.1%
        pledges[numPledges].amount = _potAmount - users[bank].balances[_potUnit];
        pledges[numPledges].pot = pledges[numPledges].amount;

        numPledges = numPledges + 1;

        // finally, do the transfer
        if (_potUnit != address(0)) {
            IERC20 tkn = IERC20(_potUnit);
            require(tkn.balanceOf(msg.sender) >= _potAmount, 'not enough token balance');
            require(tkn.allowance(bank, msg.sender) >= _potAmount, 'need approval');
            require(IERC20(_potUnit).transferFrom(msg.sender, bank, _potAmount), 'transfer failed');
        } else {
            require(msg.value >= _potAmount, 'not enough ETH');
        }
    }

    function judgePledge(uint _pledgeId, bool _result) public canJudge(_pledgeId) {
        // create a judgement
        uint jid = numJudgements;
        numJudgements = jid + 1;

        Judgement storage j = judgements[jid];
        j.pledgeId = _pledgeId;
        j.passed = _result;

        // mark judgements
        Pledge storage p = pledges[_pledgeId];
        p.judgements[msg.sender] = jid;
        p.numJudgements += 1;
        if (!_result) {
            p.numFailedJudgements += 1;
        }

        // if enough negative judgements then close pledge right now
        if (pledgeFailed(_pledgeId)) {
            closePledge(_pledgeId);
        }
    }

    function updateBalances(address _user) public {
        User storage u = users[_user];

        for (uint i = u.latestActiveCreatedPledge; i < u.numPledgesCreated; i += 1) {
            uint pledgeId = u.pledgesCreated[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && pledgeEnded(pledgeId) && !pledgeCanBeJudged(pledgeId)) {
                closePledge(pledgeId);
                u.latestActiveCreatedPledge += 1;
            }
        }

        for (uint i = u.latestActiveJudgedPledge; i < u.numPledgesJudged; i += 1) {
            uint pledgeId = u.pledgesCreated[i];
            Pledge storage p = pledges[pledgeId];
            // if pledge pot yet to be redistributed
            if (p.pot > 0 && pledgeEnded(pledgeId) && !pledgeCanBeJudged(pledgeId)) {
                closePledge(pledgeId);
                u.latestActiveJudgedPledge += 1;
            }
        }
    }

    function calculateWithdrawableBalance(address _user, address _unit) public returns (uint) {
        updateBalances(_user);
        return users[_user].balances[_unit];
    }

    function withdraw (address _unit) public {
        updateBalances(msg.sender);
        withdrawBalance(msg.sender, msg.sender, _unit);
    }

    function withdrawAdminFee (address _unit) public isAdmin {
        withdrawBalance(bank, msg.sender, _unit);
    }

    function pledgeEnded (uint _pledgeId) public view returns (bool) {
        return now >= pledges[_pledgeId].endDate;
    }

    function pledgeCanBeJudged (uint _pledgeId) public view returns (bool) {
        return (now - pledges[_pledgeId].endDate < 2 weeks);
    }

    function pledgeFailed (uint _pledgeId) public view returns (bool) {
        return (pledges[_pledgeId].numFailedJudgements > (pledges[_pledgeId].numJudges / 2));
    }

    function calculatePledgeFingerprint(
      address _creator,
      uint _potAmount,
      address _potUnit,
      uint _endDate
    ) public pure returns (bytes32) {
      return keccak256(abi.encodePacked(_creator, _potAmount, _potUnit, _endDate));
    }

    function calculateMsgHash(
      string memory _prefix,
      address _creator,
      uint _potAmount,
      address _potUnit,
      uint _endDate
    ) public pure returns (bytes32) {
      bytes32 fingerprint = calculatePledgeFingerprint(_creator, _potAmount, _potUnit, _endDate);
      return ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(_prefix, fingerprint)));
    }

    function lock () public isAdmin {
        locked = true;
    }

    function unlock () public isAdmin {
        locked = false;
    }

    /// Internal functions ///

    function closePledge(uint _pledgeId) internal {
        Pledge storage p = pledges[_pledgeId];

        // failed?
        if (pledgeFailed(_pledgeId)) {
            // split amongst judges
            for (uint i = 0; i < p.numJudges; i += 1) {
                address j = p.judges[i];
                users[j].balances[p.unit] = p.pot / p.numJudges;
            }
        }
        // passed?
        else {
            users[p.creator].balances[p.unit] = p.pot;
        }

        p.pot = 0;
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
}